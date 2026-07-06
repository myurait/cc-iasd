import fs from 'node:fs';
import path from 'node:path';
import { append, readAll, subjectKind, subjectId } from '../journal.js';
import { derive } from '../state.js';
import { load as loadConfig } from '../config.js';
import { refuse } from '../refuse.js';
import { write } from '../writePath.js';
import { contentHash } from '../hash.js';
import { slugify } from '../ulid.js';
import { autoCommit } from '../gitops.js';

// humans.js — decide / gap add|close|route / review record を担当する。
// 05 の遷移ガード表・gap 終端条件・review 鮮度、06 の event schema、
// 08 のコマンド定義に従う。ガードはすべて決定論（ファイル存在 / journal カウント /
// hash 一致 / TTY 検査）であり、自己申告を評価しない。

// review record が受け付ける gate 種別。
const GATES = new Set(['spec', 'launch', 'run', 'completion']);
const VERDICTS = new Set(['pass', 'fail']);
// vision approve が起こす遷移の許可元状態。
const VISION_APPROVE_FROM = 'draft';

// ref を "<kind>:<id>" に分解する。kind が欠ければ null。
function parseRef(ref) {
  const s = String(ref == null ? '' : ref);
  const idx = s.indexOf(':');
  if (idx === -1) return null;
  return { kind: s.slice(0, idx), id: s.slice(idx + 1), ref: s };
}

// 対象 artifact の authored 本文の絶対パスを解決する（review 鮮度の hash 計算用）。
// 見つからなければ null。
function resolveArtifactPath(root, ref) {
  const p = parseRef(ref);
  if (!p) return null;
  const { kind, id } = p;
  const candidates = [];
  switch (kind) {
    case 'vision':
      candidates.push(...globishMd(path.join(root, 'vision'), id));
      break;
    case 'spec':
      candidates.push(...specDirs(root, id));
      break;
    case 'campaign':
      candidates.push(...campaignCharters(root, id));
      break;
    case 'gap':
      candidates.push(...globishMd(path.join(root, 'gaps'), id));
      break;
    case 'decision':
      candidates.push(...globishMd(path.join(root, 'decisions'), id));
      break;
    case 'run':
      candidates.push(path.join(root, 'runs', dirBySlug(root, 'runs', id), 'notes.md'));
      break;
    default:
      break;
  }
  for (const c of candidates) {
    if (c && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

// dir 直下で "<id>" または "<id>-*.md" に一致する Markdown を列挙する。
function globishMd(dir, id) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.md')) continue;
    const base = f.slice(0, -3);
    if (base === id || base.startsWith(`${id}-`)) out.push(path.join(dir, f));
  }
  return out;
}

// specs/<id>-*/spec.md を列挙する。
function specDirs(root, id) {
  const dir = path.join(root, 'specs');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir)) {
    if (d === id || d.startsWith(`${id}-`)) out.push(path.join(dir, d, 'spec.md'));
  }
  return out;
}

// campaigns/<id>-*/charter.md を列挙する。
function campaignCharters(root, id) {
  const dir = path.join(root, 'campaigns');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir)) {
    if (d === id || d.startsWith(`${id}-`)) out.push(path.join(dir, d, 'charter.md'));
  }
  return out;
}

// <area>/ 直下で "<id>" もしくは "<id>-*" のディレクトリ名を返す（無ければ id）。
function dirBySlug(root, area, id) {
  const dir = path.join(root, area);
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir)) {
      if (d === id || d.startsWith(`${id}-`)) return d;
    }
  }
  return id;
}

// TTY 検査。config.decision.require_tty=true のとき、非 TTY を拒否する。
function assertTty(cfg, command, next) {
  if (!cfg.decision.require_tty) return;
  if (!process.stdin.isTTY) {
    throw refuse(
      command,
      [{ input: 'tty', detail: 'decide は TTY が必須です（headless での自己承認は不可）' }],
      next
    );
  }
}

// 次の連番 gap id（gNNN）を journal の gap.opened から決定論的に算定する。
function nextGapId(events) {
  let max = 0;
  for (const ev of events) {
    if (ev.type !== 'gap.opened') continue;
    const id = subjectId(ev.subject); // gNNN
    const m = /^g(\d+)$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `g${String(max + 1).padStart(3, '0')}`;
}

// journal から run gate の fail review 件数を数える（reject 階梯用）。
function countRejects(events, runRef) {
  let n = 0;
  for (const ev of events) {
    if (ev.type !== 'review.recorded') continue;
    if (ev.subject !== runRef) continue;
    const d = ev.data || {};
    if (d.gate === 'run' && d.verdict === 'fail') n += 1;
  }
  return n;
}

// ---- decide ----

// cc-iasd decide <decision-id> [--approve <ref>] [--adopt <file>]
// TTY 検査後、decision.recorded（actor=human）を記録し、
// 対象（vision approve / escalation / blocking gap）の解除遷移を起こす。
function decide({ positional, flags, root, jsonMode }) {
  const decisionId = positional[0];
  if (!decisionId) {
    throw refuse(
      'decide',
      [{ input: 'decision-id', detail: 'decision id を指定してください' }],
      ['cc-iasd decide d001-xxx']
    );
  }
  const cfg = loadConfig(root);
  const subject = `decision:${decisionId}`;

  assertTty(cfg, `decide ${decisionId}`, ['TTY のある端末から cc-iasd decide を実行']);

  // --adopt は config.decision.allow_adopt=true のときのみ。
  let adoptPath = null;
  if (flags.adopt) {
    if (!cfg.decision.allow_adopt) {
      throw refuse(
        `decide ${decisionId}`,
        [
          {
            input: 'adopt',
            detail: 'decision.allow_adopt=false のため --adopt は無効です',
          },
        ],
        ['cc-iasd.yaml の decision.allow_adopt を true にする', 'TTY で cc-iasd decide を実行']
      );
    }
    adoptPath = path.resolve(String(flags.adopt));
    if (!fs.existsSync(adoptPath)) {
      throw refuse(
        `decide ${decisionId}`,
        [{ input: 'adopt-file', detail: `decision ファイルが存在しません: ${adoptPath}` }],
        ['配置した decision ファイルのパスを確認']
      );
    }
  }

  // adopt 経路では decision ファイル本文を decisions/ へ取り込む。
  let payload;
  if (adoptPath) {
    const text = fs.readFileSync(adoptPath, 'utf8');
    const rel = path.join('decisions', `${decisionId}.md`);
    write(root, rel, text);
    payload = { path: rel, sha256: contentHash(text) };
  }

  // decision.recorded（actor=human）。adopt は data に取込元を記録。
  const data = { actor_channel: adoptPath ? 'adopt' : 'tty' };
  if (adoptPath) data.adopted_from = adoptPath;

  const decisionEvent = {
    type: 'decision.recorded',
    subject,
    actor: { kind: 'human' },
    data,
  };
  if (payload) decisionEvent.payload = payload;

  const approveRef = flags.approve ? String(flags.approve) : null;
  if (approveRef) {
    decisionEvent.refs = [{ rel: 'decides', to: approveRef }];
  }
  const decisionEventId = append(root, decisionEvent);

  const released = [];

  // --approve vision:<id> は vision draft->approved を起こす（3 章）。
  if (approveRef) {
    const p = parseRef(approveRef);
    if (p && p.kind === 'vision') {
      const events = readAll(root);
      const snap = derive(events);
      const node = snap.nodes[approveRef];
      const from = (node && node.status) || VISION_APPROVE_FROM;
      // 承認は decide 一発。ここでの decision 記録が「対応する decision 記録あり」を満たす。
      const transEvent = {
        type: 'transitioned',
        subject: approveRef,
        actor: { kind: 'human' },
        data: {
          from,
          to: 'approved',
          guard_results: [
            { name: 'decision-recorded', pass: true, detail: `decision:${decisionId}` },
          ],
        },
        refs: [{ rel: 'approved-by', to: subject }],
      };
      append(root, transEvent);
      released.push({ target: approveRef, to: 'approved' });
    }
  }

  autoCommit(root, `decide ${decisionId}`);

  const result = {
    ok: true,
    command: `decide ${decisionId}`,
    decision: subject,
    eventId: decisionEventId,
    channel: adoptPath ? 'adopt' : 'tty',
    released,
  };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    const lines = [`記録: decision ${decisionId}（actor=human, channel=${result.channel}）`];
    for (const r of released) lines.push(`  解除: ${r.target} -> ${r.to}`);
    process.stdout.write(lines.join('\n') + '\n');
  }
}

// ---- gap ----

// cc-iasd gap add <subject> --kind <k> [--route <r>] [--blocking]
function gapAdd({ positional, flags, root, jsonMode }) {
  const subjectTarget = positional[0]; // gap の対象 artifact ref（例 spec:s001）
  if (!subjectTarget) {
    throw refuse(
      'gap add',
      [{ input: 'subject', detail: 'gap の対象 ref を指定してください（例 spec:s001）' }],
      ['cc-iasd gap add spec:s001 --kind needs-human-decision']
    );
  }
  const kind = flags.kind ? String(flags.kind) : null;
  if (!kind) {
    throw refuse(
      'gap add',
      [{ input: 'kind', detail: 'gap の kind を指定してください' }],
      [
        'cc-iasd gap add ' +
          subjectTarget +
          ' --kind needs-human-decision|needs-upstream-fix|needs-info|candidate',
      ]
    );
  }
  const route = flags.route ? String(flags.route) : 'none';
  const blocking = !!flags.blocking;

  const events = readAll(root);
  const gid = nextGapId(events);
  const slug = slugify(kind);
  const gapRel = path.join('gaps', `${gid}-${slug}.md`);

  // authored 本文の skeleton（背景 / 選択肢 / 推奨 / routing 提案。06 7.2）。
  const body =
    `---\nid: ${gid}\nrefs:\n  - target: ${subjectTarget}\n---\n\n` +
    `# gap ${gid}\n\n## 背景\n\n<!-- 未確定事項の背景を記す -->\n\n` +
    `## 選択肢\n\n<!-- 選択肢を列挙する -->\n\n` +
    `## 推奨\n\n<!-- 推奨を記す -->\n\n` +
    `## routing 提案\n\n<!-- どの層へ戻すか -->\n`;
  write(root, gapRel, body);

  const eventId = append(root, {
    type: 'gap.opened',
    subject: `gap:${gid}`,
    actor: { kind: 'agent' },
    data: { kind, route, blocking, source: 'cli', target: subjectTarget },
    refs: [{ rel: 'target', to: subjectTarget }],
  });

  autoCommit(root, `gap add ${gid}`);

  const result = {
    ok: true,
    command: 'gap add',
    gap: `gap:${gid}`,
    kind,
    route,
    blocking,
    target: subjectTarget,
    path: gapRel,
    eventId,
  };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(
      `起票: gap ${gid}（kind=${kind}, route=${route}, blocking=${blocking}, target=${subjectTarget}）\n` +
        `  本文: ${gapRel}\n`
    );
  }
}

// cc-iasd gap close <id> --decision <d-id> | --edited
// closed の成立条件（05 4.1）: decision リンク、または対象編集 + 再 review を機械で強制する。
function gapClose({ positional, flags, root, jsonMode }) {
  const gid = positional[0];
  if (!gid) {
    throw refuse(
      'gap close',
      [{ input: 'gap-id', detail: 'gap id を指定してください' }],
      ['cc-iasd gap close g001 --decision d001-xxx']
    );
  }
  const events = readAll(root);
  const snap = derive(events);
  const g = snap.gaps[gid];
  if (!g || g.status !== 'open') {
    throw refuse(
      `gap close ${gid}`,
      [{ input: 'gap', detail: g ? `gap ${gid} は既に ${g.status} です` : `gap ${gid} が存在しません` }],
      ['cc-iasd status']
    );
  }

  const decisionId = flags.decision ? String(flags.decision) : null;
  const edited = !!flags.edited;
  if (!decisionId && !edited) {
    throw refuse(
      `gap close ${gid}`,
      [
        {
          input: 'close-basis',
          detail: 'closed は decision リンク（--decision）または対象編集 + 再 review（--edited）が必須です',
        },
      ],
      [`cc-iasd gap close ${gid} --decision d001-xxx`, `cc-iasd gap close ${gid} --edited`]
    );
  }

  const refs = [];
  if (decisionId) {
    // decision リンクによる close。decision が decided であることを機械確認する。
    const dref = `decision:${decisionId}`;
    const dnode = snap.nodes[dref];
    if (!dnode || dnode.status !== 'decided') {
      throw refuse(
        `gap close ${gid}`,
        [
          {
            input: 'decision',
            detail: `decision ${decisionId} が decided ではありません（decide が未実行）`,
          },
        ],
        [`cc-iasd decide ${decisionId}`]
      );
    }
    refs.push({ rel: 'closed-by-decision', to: dref });
  } else {
    // 対象編集 + 再 review による close。対象 artifact の現 content-hash と
    // 該当 gate の review record hash の一致を機械確認する（05 4.1 / 8 章）。
    const target = g.target;
    if (!target) {
      throw refuse(
        `gap close ${gid}`,
        [{ input: 'target', detail: `gap ${gid} に対象 artifact ref がありません` }],
        [`cc-iasd gap close ${gid} --decision d001-xxx`]
      );
    }
    const artPath = resolveArtifactPath(root, target);
    if (!artPath) {
      throw refuse(
        `gap close ${gid}`,
        [{ input: 'target-file', detail: `対象 artifact の本文が見つかりません: ${target}` }],
        [`対象 ${target} の本文を配置してから再実行`]
      );
    }
    const curHash = contentHash(fs.readFileSync(artPath, 'utf8'));
    const gate = gateForKind(subjectKind(target));
    const recorded = (snap.reviews[target] || {})[gate];
    if (!recorded) {
      throw refuse(
        `gap close ${gid}`,
        [
          {
            input: 'review',
            detail: `対象 ${target} に gate=${gate} の review record がありません（再 review 未実施）`,
          },
        ],
        [`cc-iasd review record ${target} --gate ${gate} --verdict pass`]
      );
    }
    if (recorded !== curHash) {
      throw refuse(
        `gap close ${gid}`,
        [
          {
            input: 'review-hash',
            detail: `review record が stale です（対象編集後の再 review が必要）`,
          },
        ],
        [`cc-iasd review record ${target} --gate ${gate} --verdict pass`]
      );
    }
    refs.push({ rel: 'closed-by-edit', to: target });
  }

  const eventId = append(root, {
    type: 'gap.closed',
    subject: `gap:${gid}`,
    actor: { kind: decisionId ? 'human' : 'agent' },
    data: { to: 'closed', basis: decisionId ? 'decision' : 'edited' },
    refs,
  });

  autoCommit(root, `gap close ${gid}`);

  const result = { ok: true, command: 'gap close', gap: `gap:${gid}`, to: 'closed', eventId };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(`close: gap ${gid} -> closed（${decisionId ? 'decision' : 'edited'}）\n`);
  }
}

// gap 対象の kind から再 review が要求される gate を決める。
function gateForKind(kind) {
  if (kind === 'spec') return 'spec';
  if (kind === 'campaign') return 'launch';
  if (kind === 'run') return 'run';
  return 'spec';
}

// cc-iasd gap route <id> --to <ref>
// routed の成立条件（05 4.1）: blocking=false かつ route あり。blocking gap は routed にできない。
function gapRoute({ positional, flags, root, jsonMode }) {
  const gid = positional[0];
  if (!gid) {
    throw refuse(
      'gap route',
      [{ input: 'gap-id', detail: 'gap id を指定してください' }],
      ['cc-iasd gap route g001 --to vision:v001']
    );
  }
  const to = flags.to ? String(flags.to) : null;
  if (!to) {
    throw refuse(
      `gap route ${gid}`,
      [{ input: 'to', detail: 'route 先（--to <ref>）を指定してください' }],
      [`cc-iasd gap route ${gid} --to vision:v001`]
    );
  }
  const events = readAll(root);
  const snap = derive(events);
  const g = snap.gaps[gid];
  if (!g || g.status !== 'open') {
    throw refuse(
      `gap route ${gid}`,
      [{ input: 'gap', detail: g ? `gap ${gid} は既に ${g.status} です` : `gap ${gid} が存在しません` }],
      ['cc-iasd status']
    );
  }
  // blocking gap を routed にはできない。先に decision / 上流編集で解消する。
  if (g.blocking) {
    throw refuse(
      `gap route ${gid}`,
      [
        {
          input: 'blocking',
          detail: 'blocking gap は routed にできません。decision または上流編集で blocking を先に解消してください',
        },
      ],
      [`cc-iasd gap close ${gid} --decision d001-xxx`, `cc-iasd gap close ${gid} --edited`]
    );
  }

  const eventId = append(root, {
    type: 'gap.closed',
    subject: `gap:${gid}`,
    actor: { kind: 'agent' },
    data: { to: 'routed', route: to },
    refs: [{ rel: 'routed-to', to }],
  });

  autoCommit(root, `gap route ${gid}`);

  const result = { ok: true, command: 'gap route', gap: `gap:${gid}`, to: 'routed', route: to, eventId };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    process.stdout.write(`route: gap ${gid} -> routed（route=${to}）\n`);
  }
}

// ---- review record ----

// cc-iasd review record <ref> --gate spec|launch|run|completion --verdict pass|fail
// 対象の content-hash を刻印した review.recorded を記録し、evidence/reviews/ へ保存する。
// fail は run の reject_count（reject 階梯）を進める。
function reviewRecord({ positional, flags, root, jsonMode }) {
  // positional[0] は "record" サブコマンド、positional[1] が対象 ref。
  const sub = positional[0];
  if (sub !== 'record') {
    throw refuse(
      'review',
      [{ input: 'subcommand', detail: 'review record のみ対応です' }],
      ['cc-iasd review record spec:s001 --gate spec --verdict pass']
    );
  }
  const ref = positional[1];
  if (!ref) {
    throw refuse(
      'review record',
      [{ input: 'ref', detail: '対象 ref を指定してください（例 spec:s001）' }],
      ['cc-iasd review record spec:s001 --gate spec --verdict pass']
    );
  }
  const gate = flags.gate ? String(flags.gate) : null;
  if (!gate || !GATES.has(gate)) {
    throw refuse(
      'review record',
      [{ input: 'gate', detail: 'gate は spec|launch|run|completion のいずれかです' }],
      [`cc-iasd review record ${ref} --gate spec --verdict pass`]
    );
  }
  const verdict = flags.verdict ? String(flags.verdict) : null;
  if (!verdict || !VERDICTS.has(verdict)) {
    throw refuse(
      'review record',
      [{ input: 'verdict', detail: 'verdict は pass|fail のいずれかです' }],
      [`cc-iasd review record ${ref} --gate ${gate} --verdict pass`]
    );
  }

  // 対象 content-hash を刻印する（05 8 章の鮮度判定の照合キー）。
  const artPath = resolveArtifactPath(root, ref);
  if (!artPath) {
    throw refuse(
      'review record',
      [{ input: 'target-file', detail: `対象 artifact の本文が見つかりません: ${ref}` }],
      [`対象 ${ref} の本文を配置してから再実行`]
    );
  }
  const text = fs.readFileSync(artPath, 'utf8');
  const hash = contentHash(text);

  // evidence/reviews/ へ record を保存する（対象 content-hash 刻印つき）。
  const relTarget = String(ref).replace(/[^a-zA-Z0-9._-]/g, '_');
  const recordRel = path.join('evidence', 'reviews', `${relTarget}.${gate}.json`);
  const record = {
    ref,
    gate,
    verdict,
    sha256: hash,
    ts: new Date().toISOString(),
  };
  write(root, recordRel, JSON.stringify(record, null, 2) + '\n');

  // review.recorded event（payload に対象 content-hash を刻印）。
  const eventId = append(root, {
    type: 'review.recorded',
    subject: ref,
    actor: { kind: 'agent' },
    data: { gate, verdict },
    payload: { path: recordRel, sha256: hash },
    refs: [{ rel: 'reviews', to: ref }],
  });

  // reject 階梯: run gate の fail は reject_count を進める（journal カウント）。
  let rejectCount = null;
  let rejectLimit = null;
  if (gate === 'run' && verdict === 'fail') {
    const cfg = loadConfig(root);
    const afterEvents = readAll(root); // 追記後の journal を数える
    rejectCount = countRejects(afterEvents, ref);
    rejectLimit = cfg.reject_limit;
  }

  autoCommit(root, `review record ${ref} ${gate} ${verdict}`);

  const result = {
    ok: true,
    command: 'review record',
    ref,
    gate,
    verdict,
    sha256: hash,
    path: recordRel,
    eventId,
  };
  if (rejectCount != null) {
    result.reject_count = rejectCount;
    result.reject_limit = rejectLimit;
    result.reject_blocked = rejectCount >= rejectLimit;
  }
  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    const lines = [`review: ${ref} gate=${gate} verdict=${verdict}（hash=${hash.slice(0, 12)}...）`];
    lines.push(`  record: ${recordRel}`);
    if (rejectCount != null) {
      lines.push(
        `  reject_count=${rejectCount}/${rejectLimit}${
          rejectCount >= rejectLimit ? '（accept 封鎖。escalate のみ）' : ''
        }`
      );
    }
    process.stdout.write(lines.join('\n') + '\n');
  }
}

// dispatcher 規約: run(command, { positional, flags, root, jsonMode }) を公開する。
export function run(ctx) {
  const { command, positional } = ctx;
  if (command === 'decide') return decide(ctx);
  if (command === 'gap') {
    const sub = positional[0];
    const rest = { ...ctx, positional: positional.slice(1) };
    if (sub === 'add') return gapAdd(rest);
    if (sub === 'close') return gapClose(rest);
    if (sub === 'route') return gapRoute(rest);
    throw refuse(
      'gap',
      [{ input: 'subcommand', detail: 'gap は add|close|route のいずれかです' }],
      ['cc-iasd gap add spec:s001 --kind needs-info']
    );
  }
  if (command === 'review') return reviewRecord(ctx);
  throw refuse(
    command,
    [{ input: 'command', detail: `humans.js は decide/gap/review を担当します（${command} は対象外）` }],
    []
  );
}

export default run;
