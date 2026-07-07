import fs from 'node:fs';
import path from 'node:path';
import { load as yamlLoad } from 'js-yaml';

import { readAll, append, subjectId } from '../journal.js';
import { derive, blockingGapsFor } from '../state.js';
import { attempt } from '../transitions.js';
import { refuse } from '../refuse.js';
import { write } from '../writePath.js';
import { autoCommit } from '../gitops.js';
import { slugify } from '../ulid.js';
import { contentHash } from '../hash.js';
import { extractSection } from '../handoff.js';
import { load as loadConfig, checkAllowed } from '../config.js';

// ------------------------------------------------------------------
// テンプレート探索。init が配置する project-context 内 templates/ を優先し、
// 無ければパッケージ同梱 templates/ を使う。
// ------------------------------------------------------------------
const PKG_TEMPLATES = path.resolve(new URL('../../templates', import.meta.url).pathname);

function readTemplate(root, name) {
  const local = path.join(root, 'templates', name);
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  const pkg = path.join(PKG_TEMPLATES, name);
  if (fs.existsSync(pkg)) return fs.readFileSync(pkg, 'utf8');
  throw new Error(`テンプレートが見つかりません: ${name}`);
}

function fillTemplate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : `{{${key}}}`));
}

// ------------------------------------------------------------------
// ID 連番。既存 authored ディレクトリ/ファイルを走査して vNNN / sNNN / cNNN の次番を返す。
// journal の created を正本にしつつ、ファイル系（scaffold 済みで journal 未確定）も拾う。
// ------------------------------------------------------------------
function nextSeqId(root, kind, events) {
  const prefix = { vision: 'v', spec: 's', campaign: 'c' }[kind];
  let max = 0;
  const bump = (id) => {
    const m = new RegExp(`^${prefix}(\\d{3,})`).exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  };
  for (const ev of events) {
    if (ev.type === 'created' && ev.subject && ev.subject.startsWith(`${kind}:`)) {
      bump(subjectId(ev.subject));
    }
  }
  const dir = { vision: 'vision', spec: 'specs', campaign: 'campaigns' }[kind];
  const abs = path.join(root, dir);
  if (fs.existsSync(abs)) {
    for (const entry of fs.readdirSync(abs)) bump(entry);
  }
  const n = String(max + 1).padStart(3, '0');
  return `${prefix}${n}`;
}

// ------------------------------------------------------------------
// frontmatter 解析。id と refs（[{rel,to}] または {rel:[to..]} 双方許容）を返す。
// refs は宣言入力（設計 06 2.3）。guard は正規化した {rel,to} 列で扱う。
// ------------------------------------------------------------------
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''));
  if (!m) return { id: null, refs: [] };
  let doc;
  try {
    doc = yamlLoad(m[1]) || {};
  } catch {
    return { id: null, refs: [] };
  }
  const refs = normalizeRefs(doc.refs);
  return { id: doc.id != null ? String(doc.id) : null, refs };
}

function normalizeRefs(raw) {
  const out = [];
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (typeof r === 'string') {
        // "- upstream vision:v001" / "- vision:v001"（空白区切り列挙）。
        const parts = r.trim().split(/\s+/);
        if (parts.length >= 2) out.push({ rel: parts[0], to: parts[1] });
        else out.push({ rel: 'ref', to: parts[0] });
      } else if (r && typeof r === 'object') {
        if (r.to != null) {
          // 明示 {rel, to} 形式。
          out.push({ rel: r.rel || 'ref', to: String(r.to) });
        } else {
          // 単一キー map の配列要素「- upstream: vision:v001」（08 7 章の author 記法）。
          // YAML は各要素を { upstream: 'vision:v001' } のオブジェクトへ読む。
          // key=rel, value=to として正規化し、この自然記法を確実に取り込む。
          for (const [rel, to] of Object.entries(r)) {
            if (to == null) continue;
            const list = Array.isArray(to) ? to : [to];
            for (const t of list) if (t != null) out.push({ rel, to: String(t) });
          }
        }
      }
    }
  } else if (raw && typeof raw === 'object') {
    // map 形式「refs: { upstream: x }」。
    for (const [rel, val] of Object.entries(raw)) {
      const list = Array.isArray(val) ? val : [val];
      for (const to of list) if (to != null) out.push({ rel, to: String(to) });
    }
  }
  return out;
}

function refsByRel(refs, rel) {
  return refs.filter((r) => r.rel === rel).map((r) => r.to);
}

// ------------------------------------------------------------------
// authored payload パスヘルパ。
// ------------------------------------------------------------------
function findDirBySeq(root, dir, id) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return null;
  for (const entry of fs.readdirSync(abs)) {
    if (entry === id || entry.startsWith(`${id}-`)) return entry;
  }
  return null;
}
function findFileBySeq(root, dir, id) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return null;
  for (const entry of fs.readdirSync(abs)) {
    if (entry === `${id}.md` || entry.startsWith(`${id}-`)) return entry;
  }
  return null;
}
function specBodyPath(root, id) {
  return path.join('specs', findDirBySeq(root, 'specs', id) || `${id}`, 'spec.md');
}
function campaignBodyPath(root, id) {
  return path.join('campaigns', findDirBySeq(root, 'campaigns', id) || `${id}`, 'charter.md');
}
function visionBodyPath(root, id) {
  return path.join('vision', findFileBySeq(root, 'vision', id) || `${id}.md`);
}

function readManaged(root, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

// spec の Checks セクションから各 check の run コマンドを抽出する。
// 形式: `- id: x ; run: "cmd" ; cwd: ... ; expect: {...}`
function extractCheckCommands(specBody) {
  const section = extractSection(specBody, 'Checks');
  if (!section) return [];
  const cmds = [];
  const re = /run:\s*"([^"]*)"|run:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    cmds.push(m[1] != null ? m[1] : m[2]);
  }
  return cmds;
}

// spec の checks を承認する decided decision が存在するか（decision の refs が spec を指す）。
function hasChecksApproval(snapshot, specRef) {
  for (const [subject, node] of Object.entries(snapshot.nodes)) {
    if (!subject.startsWith('decision:')) continue;
    if (node.status !== 'decided') continue;
    if ((node.refs || []).some((r) => r.to === specRef)) return true;
  }
  return false;
}

// ==================================================================
// new: scaffold 生成 + created event
// ==================================================================
function cmdNew({ positional, root }) {
  const kind = positional[0];
  const slugArg = positional.slice(1).join(' ');
  if (!['vision', 'spec', 'campaign'].includes(kind)) {
    throw refuse(
      'new',
      [{ input: 'kind', detail: 'vision | spec | campaign のいずれかを指定してください' }],
      ['cc-iasd new vision <slug>', 'cc-iasd new spec <slug>', 'cc-iasd new campaign <slug>']
    );
  }
  if (!slugArg) {
    throw refuse(
      `new ${kind}`,
      [{ input: 'slug', detail: 'slug（対象の短い識別名）が必要です' }],
      [`cc-iasd new ${kind} <slug>`]
    );
  }

  const events = readAll(root);
  const id = nextSeqId(root, kind, events);
  const slug = slugify(slugArg);
  const cfg = loadConfig(root);
  const docLang = cfg.doc_lang;

  const templateName = { vision: 'vision_template.md', spec: 'spec_template.md', campaign: 'charter_template.md' }[kind];
  const filled = fillTemplate(readTemplate(root, templateName), { id, slug, docLang });

  let relFile;
  if (kind === 'vision') {
    relFile = path.join('vision', `${id}-${slug}.md`);
  } else if (kind === 'spec') {
    relFile = path.join('specs', `${id}-${slug}`, 'spec.md');
  } else {
    relFile = path.join('campaigns', `${id}-${slug}`, 'charter.md');
  }

  write(root, relFile, filled);
  const subject = `${kind}:${id}`;
  append(root, { type: 'created', subject, actor: { kind: 'agent' } });
  autoCommit(root, `new ${kind} ${id}-${slug}`);

  return { ok: true, kind, id, slug, path: relFile, subject };
}

// ==================================================================
// spec ready ガード（設計 05 3 章）
// ==================================================================
function specReadyGuards(root, specId, snapshot, cfg) {
  const specRef = `spec:${specId}`;
  const relPath = specBodyPath(root, specId);
  const body = readManaged(root, relPath);

  return [
    function specSections() {
      if (body == null) return { name: 'spec-body', pass: false, detail: `spec 本文が見つかりません: ${relPath}` };
      const required = ['Requirements', 'Acceptance', 'Surfaces', 'Checks'];
      const empty = required.filter((sec) => {
        const s = extractSection(body, sec);
        return s == null || s.length === 0;
      });
      return empty.length === 0
        ? { name: 'spec-sections', pass: true, detail: '必須セクション充足' }
        : { name: 'spec-sections', pass: false, detail: `空/欠落セクション: ${empty.join(', ')}` };
    },
    function noBlockingGap() {
      const gaps = blockingGapsFor(snapshot, specRef);
      return gaps.length === 0
        ? { name: 'no-blocking-gap', pass: true, detail: 'blocking gap なし' }
        : { name: 'no-blocking-gap', pass: false, detail: `open な blocking gap: ${gaps.join(', ')}` };
    },
    function upstreamVisionApproved() {
      const fm = body != null ? parseFrontmatter(body) : { refs: [] };
      const visionRefs = fm.refs.filter((r) => r.to && r.to.startsWith('vision:')).map((r) => r.to);
      if (visionRefs.length === 0) {
        return { name: 'upstream-vision', pass: false, detail: '上流 vision の宣言（frontmatter refs に vision:<id>）がありません' };
      }
      const notApproved = visionRefs.filter((v) => {
        const vn = snapshot.nodes[v];
        return !vn || vn.status !== 'approved';
      });
      return notApproved.length === 0
        ? { name: 'upstream-vision', pass: true, detail: `vision approved: ${visionRefs.join(', ')}` }
        : { name: 'upstream-vision', pass: false, detail: `未 approved の上流 vision: ${notApproved.join(', ')}` };
    },
    function specReviewFresh() {
      if (body == null) return { name: 'spec-review', pass: false, detail: 'spec 本文が無く review 照合不能' };
      const rec = (snapshot.reviews[specRef] || {}).spec;
      if (!rec) {
        return { name: 'spec-review', pass: false, detail: 'gate=spec の review record がありません' };
      }
      const cur = contentHash(body);
      return rec === cur
        ? { name: 'spec-review', pass: true, detail: 'review record が現在の content-hash と一致' }
        : { name: 'spec-review', pass: false, detail: 'review record が stale（編集後に再 review が必要）' };
    },
    function checksAllowlist() {
      if (body == null) return { name: 'checks-allowlist', pass: false, detail: 'spec 本文が無く Checks 照合不能' };
      const cmds = extractCheckCommands(body);
      const violating = cmds.filter((c) => !checkAllowed(cfg, c));
      if (violating.length === 0) {
        return { name: 'checks-allowlist', pass: true, detail: 'Checks は allowlist 適合' };
      }
      if (hasChecksApproval(snapshot, specRef)) {
        return { name: 'checks-allowlist', pass: true, detail: 'allowlist 外 Checks は decision 承認済み' };
      }
      return {
        name: 'checks-allowlist',
        pass: false,
        detail: `allowlist 外の Checks（decision 承認が必要）: ${violating.join(' / ')}`,
      };
    },
  ];
}

function cmdSpecReady({ positional, root }) {
  const sub = positional[0];
  const specId = positional[1];
  if (sub !== 'ready') {
    throw refuse('spec', [{ input: 'subcommand', detail: `未知の spec サブコマンド: ${sub}` }], ['cc-iasd spec ready <id>']);
  }
  if (!specId) {
    throw refuse('spec ready', [{ input: 'spec-id', detail: 'spec の id が必要です' }], ['cc-iasd spec ready <id>']);
  }
  const specRef = `spec:${specId}`;
  const snapshot = derive(readAll(root));
  const node = snapshot.nodes[specRef];
  if (!node) {
    throw refuse('spec ready', [{ input: 'spec', detail: `spec ${specId} が存在しません（new が必要）` }], [`cc-iasd new spec <slug>`]);
  }
  if (node.status !== 'draft') {
    throw refuse('spec ready', [{ input: 'status', detail: `spec ${specId} は draft ではありません（現在 ${node.status}）` }], []);
  }
  const cfg = loadConfig(root);
  const guards = specReadyGuards(root, specId, snapshot, cfg);

  // 遷移時に frontmatter refs をパースし journal の refs（{rel,to}）へ写像する（06 2.3）。
  // covers / upstream 参照を transitioned event に焼き込み、covers 射影・doctor の
  // frontmatter-refs 整合検査の対象にする。
  const body = readManaged(root, specBodyPath(root, specId));
  const refs = body != null ? parseFrontmatter(body).refs : [];

  const res = attempt(root, {
    subject: specRef,
    from: 'draft',
    to: 'ready',
    guards,
    command: `spec ready ${specId}`,
    next: (failed) => nextForSpecReady(specId, failed),
    refs: refs.length ? refs : undefined,
    commitMessage: `spec ready ${specId}`,
  });
  return { ok: true, subject: specRef, to: 'ready', eventId: res.eventId };
}

function nextForSpecReady(specId, failed) {
  const cmds = [];
  const names = failed.map((f) => f.name);
  if (names.includes('no-blocking-gap')) cmds.push(`cc-iasd decide <decision-id>  # blocking gap を解消`);
  if (names.includes('upstream-vision')) cmds.push(`cc-iasd decide <decision-id>  # vision を approve`);
  if (names.includes('spec-sections')) cmds.push(`$EDITOR specs/${specId}-*/spec.md  # 欠落セクションを記入`);
  if (names.includes('spec-review')) cmds.push(`cc-iasd review record spec:${specId} --gate spec`);
  if (names.includes('checks-allowlist')) cmds.push(`cc-iasd gap add spec:${specId} --kind needs-human-decision --blocking  # allowlist 外 Checks の承認`);
  return cmds;
}

// ==================================================================
// campaign launch / close
// ==================================================================
function campaignLaunchGuards(root, campId, snapshot) {
  const campRef = `campaign:${campId}`;
  const relPath = campaignBodyPath(root, campId);
  const body = readManaged(root, relPath);

  return [
    function charterSections() {
      if (body == null) return { name: 'charter-body', pass: false, detail: `charter が見つかりません: ${relPath}` };
      const required = ['UX Outcome', 'Coverage', 'Depends On', 'Stop Conditions', 'Risk Tiers', 'Non-Regression Focus'];
      const empty = required.filter((sec) => {
        const s = extractSection(body, sec);
        return s == null || s.length === 0;
      });
      return empty.length === 0
        ? { name: 'charter-sections', pass: true, detail: 'charter 構造化欄充足' }
        : { name: 'charter-sections', pass: false, detail: `空/欠落欄: ${empty.join(', ')}` };
    },
    function coverageReady() {
      const fm = body != null ? parseFrontmatter(body) : { refs: [] };
      const covers = fm.refs.filter((r) => r.to && r.to.startsWith('spec:')).map((r) => r.to);
      if (covers.length === 0) {
        return { name: 'coverage-ready', pass: false, detail: 'coverage の spec 宣言（frontmatter refs に spec:<id>）がありません' };
      }
      const notReady = covers.filter((s) => {
        const n = snapshot.nodes[s];
        return !n || (n.status !== 'ready' && n.status !== 'in-campaign' && n.status !== 'done');
      });
      return notReady.length === 0
        ? { name: 'coverage-ready', pass: true, detail: `coverage の全 spec が ready: ${covers.join(', ')}` }
        : { name: 'coverage-ready', pass: false, detail: `ready でない coverage spec: ${notReady.join(', ')}` };
    },
    function dependsClosed() {
      const fm = body != null ? parseFrontmatter(body) : { refs: [] };
      const deps = fm.refs
        .map((r) => r.to)
        .filter((to) => to && to.startsWith('campaign:'));
      const notClosed = deps.filter((c) => {
        const n = snapshot.nodes[c];
        return !n || n.status !== 'closed';
      });
      return notClosed.length === 0
        ? { name: 'depends-closed', pass: true, detail: deps.length ? `依存 campaign 全 closed: ${deps.join(', ')}` : '依存なし' }
        : { name: 'depends-closed', pass: false, detail: `closed でない依存 campaign: ${notClosed.join(', ')}` };
    },
    function noBlockingGap() {
      const targets = [campRef];
      const fm = body != null ? parseFrontmatter(body) : { refs: [] };
      for (const r of fm.refs) if (r.to && r.to.startsWith('spec:')) targets.push(r.to);
      const found = [];
      for (const t of targets) found.push(...blockingGapsFor(snapshot, t));
      return found.length === 0
        ? { name: 'no-blocking-gap', pass: true, detail: 'blocking gap なし' }
        : { name: 'no-blocking-gap', pass: false, detail: `open な blocking gap: ${found.join(', ')}` };
    },
    function launchReviewFresh() {
      if (body == null) return { name: 'launch-review', pass: false, detail: 'charter が無く review 照合不能' };
      const rec = (snapshot.reviews[campRef] || {}).launch;
      if (!rec) return { name: 'launch-review', pass: false, detail: 'gate=launch の review record がありません' };
      const cur = contentHash(body);
      return rec === cur
        ? { name: 'launch-review', pass: true, detail: 'launch review が現在の content-hash と一致' }
        : { name: 'launch-review', pass: false, detail: 'launch review が stale（再 review が必要）' };
    },
  ];
}

function cmdCampaignLaunch({ positional, root }) {
  const campId = positional[1];
  if (!campId) {
    throw refuse('campaign launch', [{ input: 'campaign-id', detail: 'campaign の id が必要です' }], ['cc-iasd campaign launch <id>']);
  }
  const campRef = `campaign:${campId}`;
  const snapshot = derive(readAll(root));
  const node = snapshot.nodes[campRef];
  if (!node) {
    throw refuse('campaign launch', [{ input: 'campaign', detail: `campaign ${campId} が存在しません` }], ['cc-iasd new campaign <slug>']);
  }
  if (node.status !== 'draft') {
    throw refuse('campaign launch', [{ input: 'status', detail: `campaign ${campId} は draft ではありません（現在 ${node.status}）` }], []);
  }
  const guards = campaignLaunchGuards(root, campId, snapshot);

  // 遷移時に frontmatter refs（covers spec / depends_on campaign 等）を journal へ写像する（06 2.3）。
  const body = readManaged(root, campaignBodyPath(root, campId));
  const refs = body != null ? parseFrontmatter(body).refs : [];
  const coverSpecs = refs.filter((r) => r.to && r.to.startsWith('spec:')).map((r) => r.to);

  const res = attempt(root, {
    subject: campRef,
    from: 'draft',
    to: 'active',
    guards,
    command: `campaign launch ${campId}`,
    next: (failed) => nextForLaunch(campId, failed),
    refs: refs.length ? refs : undefined,
    commitMessage: `campaign launch ${campId}`,
  });

  // coverage spec を ready -> in-campaign へ遷移させる（05 2 章 spec 状態列）。
  // launch ガードが coverage の全 spec = ready を確認済み。ready の spec のみ進める
  // （既に in-campaign / done の spec は据え置く。in-campaign が正本状態になる）。
  const advanced = advanceCoverageSpecs(root, coverSpecs, 'ready', 'in-campaign', campRef);

  return { ok: true, subject: campRef, to: 'active', eventId: res.eventId, specs: advanced };
}

// coverage spec 群のうち from 状態のものを to へ遷移させる transitioned event を追記する。
// campaign 由来の決定論的遷移であり、guard_results に根拠（campaign 状態）を焼き込む。
// 戻り値は実際に遷移させた spec ref の配列。
function advanceCoverageSpecs(root, specRefs, from, to, campRef) {
  const advanced = [];
  if (!specRefs || specRefs.length === 0) return advanced;
  const snap = derive(readAll(root));
  for (const sref of specRefs) {
    const node = snap.nodes[sref];
    if (!node || node.status !== from) continue;
    // refs は付けない。spec 側 frontmatter に対応 ref（covered-by 等）が無く、
    // journal に synthetic ref を足すと doctor の frontmatter-refs 整合検査に反する。
    // 参照関係は campaign 側 node.refs の covers（frontmatter 由来）が正本になる。
    append(root, {
      type: 'transitioned',
      subject: sref,
      actor: { kind: 'cli' },
      data: {
        from,
        to,
        guard_results: [
          { name: 'coverage-of', pass: true, detail: `${campRef} の coverage（${from}->${to}）` },
        ],
      },
    });
    advanced.push(sref);
  }
  if (advanced.length) autoCommit(root, `spec ${to}: ${advanced.join(', ')}`);
  return advanced;
}

function nextForLaunch(campId, failed) {
  const cmds = [];
  const names = failed.map((f) => f.name);
  if (names.includes('charter-sections')) cmds.push(`$EDITOR campaigns/${campId}-*/charter.md  # 欠落欄を記入`);
  if (names.includes('coverage-ready')) cmds.push(`cc-iasd spec ready <spec-id>  # coverage spec を ready に`);
  if (names.includes('depends-closed')) cmds.push(`cc-iasd campaign close <dep-id>  # 依存 campaign を closed に`);
  if (names.includes('no-blocking-gap')) cmds.push(`cc-iasd decide <decision-id>  # blocking gap を解消`);
  if (names.includes('launch-review')) cmds.push(`cc-iasd review record campaign:${campId} --gate launch`);
  return cmds;
}

function campaignCloseGuards(root, campId, snapshot) {
  const campRef = `campaign:${campId}`;
  const relPath = campaignBodyPath(root, campId);
  const body = readManaged(root, relPath);

  const runsForCamp = Object.entries(snapshot.runs).filter(([, r]) => {
    return r.campaign === campId || r.campaign === campRef;
  });

  return [
    function allRunsAccepted() {
      if (runsForCamp.length === 0) {
        return { name: 'runs-accepted', pass: false, detail: 'この campaign に紐づく run がありません' };
      }
      const notAccepted = runsForCamp.filter(([, r]) => r.status !== 'accepted').map(([rid]) => rid);
      return notAccepted.length === 0
        ? { name: 'runs-accepted', pass: true, detail: `全 run accepted（${runsForCamp.length} 件）` }
        : { name: 'runs-accepted', pass: false, detail: `accepted でない run: ${notAccepted.join(', ')}` };
    },
    function allTasksDone() {
      const fm = body != null ? parseFrontmatter(body) : { refs: [] };
      const specRefs = fm.refs.filter((r) => r.to && r.to.startsWith('spec:')).map((r) => r.to);
      const declared = new Set();
      for (const sref of specRefs) {
        const sid = sref.slice('spec:'.length);
        const sbody = readManaged(root, specBodyPath(root, sid));
        const tsec = sbody != null ? extractSection(sbody, 'Tasks') : null;
        if (tsec) {
          for (const line of tsec.split('\n')) {
            const m = /^\s*[-*]\s*([A-Za-z]\w*)/.exec(line);
            if (m) declared.add(m[1]);
          }
        }
      }
      const consumed = new Set();
      for (const [, r] of runsForCamp) {
        if (r.status !== 'accepted') continue;
        // run open は data.tasks（配列）を焼き込み、derive は run.tasks に格納する。
        // 旧 run.task（単数）互換も残しつつ、配列側を必ず取り込む。
        const list = r.tasks && r.tasks.length ? r.tasks : r.task != null ? [r.task] : [];
        for (const x of list) consumed.add(String(x));
      }
      const remaining = [...declared].filter((t) => !consumed.has(t));
      return remaining.length === 0
        ? { name: 'tasks-done', pass: true, detail: declared.size ? `全 task 消化（${declared.size} 件）` : '宣言 task なし' }
        : { name: 'tasks-done', pass: false, detail: `未消化 task: ${remaining.join(', ')}` };
    },
    function gapsTerminal() {
      const openGaps = Object.entries(snapshot.gaps)
        .filter(([, g]) => g.status === 'open')
        .map(([gid]) => gid);
      return openGaps.length === 0
        ? { name: 'gaps-terminal', pass: true, detail: 'open gap なし' }
        : { name: 'gaps-terminal', pass: false, detail: `未処理 gap: ${openGaps.join(', ')}` };
    },
    function completionReviewFresh() {
      if (body == null) return { name: 'completion-review', pass: false, detail: 'charter が無く review 照合不能' };
      const rec = (snapshot.reviews[campRef] || {}).completion;
      if (!rec) return { name: 'completion-review', pass: false, detail: 'gate=completion の review record がありません' };
      const cur = contentHash(body);
      return rec === cur
        ? { name: 'completion-review', pass: true, detail: 'completion review が現在の content-hash と一致' }
        : { name: 'completion-review', pass: false, detail: 'completion review が stale（再 review が必要）' };
    },
    function completionReport() {
      // report コマンド（views.js）は終端 packet を out/<campaign-id>/report.md へ書く
      // （P1 契約 5 章の out レイアウト）。close ガードは同じ場所を検査する。
      const reportRel = path.join('out', campId, 'report.md');
      const exists = fs.existsSync(path.join(root, reportRel));
      return exists
        ? { name: 'completion-report', pass: true, detail: `completion report 存在: ${reportRel}` }
        : { name: 'completion-report', pass: false, detail: `completion report がありません: ${reportRel}（cc-iasd report campaign:${campId}）` };
    },
  ];
}

function cmdCampaignClose({ positional, root }) {
  const campId = positional[1];
  if (!campId) {
    throw refuse('campaign close', [{ input: 'campaign-id', detail: 'campaign の id が必要です' }], ['cc-iasd campaign close <id>']);
  }
  const campRef = `campaign:${campId}`;
  const snapshot = derive(readAll(root));
  const node = snapshot.nodes[campRef];
  if (!node) {
    throw refuse('campaign close', [{ input: 'campaign', detail: `campaign ${campId} が存在しません` }], []);
  }
  if (node.status !== 'active') {
    throw refuse('campaign close', [{ input: 'status', detail: `campaign ${campId} は active ではありません（現在 ${node.status}）` }], []);
  }
  const guards = campaignCloseGuards(root, campId, snapshot);

  const body = readManaged(root, campaignBodyPath(root, campId));
  const refs = body != null ? parseFrontmatter(body).refs : [];
  const coverSpecs = refs.filter((r) => r.to && r.to.startsWith('spec:')).map((r) => r.to);

  const res = attempt(root, {
    subject: campRef,
    from: 'active',
    to: 'closed',
    guards,
    actor: { kind: 'human' },
    command: `campaign close ${campId}`,
    next: (failed) => nextForClose(campId, failed),
    commitMessage: `campaign close ${campId}`,
  });

  // coverage spec を in-campaign -> done へ遷移させる（05 2 章 spec 状態列の後半）。
  // campaign が閉じたので coverage spec の完走を確定する。
  const advanced = advanceCoverageSpecs(root, coverSpecs, 'in-campaign', 'done', campRef);

  return { ok: true, subject: campRef, to: 'closed', eventId: res.eventId, specs: advanced };
}

function nextForClose(campId, failed) {
  const cmds = [];
  const names = failed.map((f) => f.name);
  if (names.includes('runs-accepted')) cmds.push(`cc-iasd run accept <run-id>  # 未受入 run を accept`);
  if (names.includes('tasks-done')) cmds.push(`cc-iasd run open ${campId} --tasks <T..>  # 未消化 task を run に`);
  if (names.includes('gaps-terminal')) cmds.push(`cc-iasd gap close <id> | route <id> --to <ref> | decide <id>`);
  if (names.includes('completion-review')) cmds.push(`cc-iasd review record campaign:${campId} --gate completion`);
  if (names.includes('completion-report')) cmds.push(`cc-iasd report campaign:${campId}`);
  return cmds;
}

function cmdCampaign(args) {
  const sub = args.positional[0];
  if (sub === 'launch') return cmdCampaignLaunch(args);
  if (sub === 'close') return cmdCampaignClose(args);
  throw refuse('campaign', [{ input: 'subcommand', detail: `未知の campaign サブコマンド: ${sub}` }], ['cc-iasd campaign launch <id>', 'cc-iasd campaign close <id>']);
}

// ==================================================================
// retire: transitioned(-> retired)。ファイル移動はしない（設計 08 3.18）
// ==================================================================
function cmdRetire({ positional, root }) {
  const ref = positional[0];
  if (!ref || !ref.includes(':')) {
    throw refuse('retire', [{ input: 'ref', detail: '<kind>:<id> 形式の ref が必要です（例 spec:s001）' }], ['cc-iasd retire <ref>']);
  }
  const snapshot = derive(readAll(root));
  const node = snapshot.nodes[ref];
  if (!node) {
    throw refuse('retire', [{ input: 'node', detail: `${ref} が存在しません` }], []);
  }
  if (node.status === 'retired') {
    throw refuse('retire', [{ input: 'status', detail: `${ref} は既に retired です` }], []);
  }
  const from = node.status;
  const res = attempt(root, {
    subject: ref,
    from,
    to: 'retired',
    guards: [() => ({ name: 'exists', pass: true, detail: `${ref} は存在する` })],
    command: `retire ${ref}`,
    commitMessage: `retire ${ref}`,
  });
  return { ok: true, subject: ref, from, to: 'retired', eventId: res.eventId };
}

// ==================================================================
// dispatcher エントリ
// ==================================================================
export async function run(args) {
  const { command } = args;
  let result;
  if (command === 'new') result = cmdNew(args);
  else if (command === 'spec') result = cmdSpecReady(args);
  else if (command === 'campaign') result = cmdCampaign(args);
  else if (command === 'retire') result = cmdRetire(args);
  else {
    throw refuse(command, [{ input: 'command', detail: `authoring が扱わないコマンド: ${command}` }], []);
  }

  if (args.jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    emitHuman(command, result);
  }
  return result;
}

function emitHuman(command, r) {
  if (command === 'new') {
    process.stdout.write(`作成: ${r.subject}\n  path: ${r.path}\n  次: $EDITOR ${r.path} で authored 節を執筆\n`);
    return;
  }
  process.stdout.write(`遷移: ${r.subject} -> ${r.to}\n`);
}

export default run;

// テスト用にガード構築関数と補助を公開する。
export const _internal = {
  nextSeqId,
  parseFrontmatter,
  normalizeRefs,
  refsByRel,
  extractCheckCommands,
  specReadyGuards,
  campaignLaunchGuards,
  campaignCloseGuards,
  cmdNew,
  cmdSpecReady,
  cmdCampaign,
  cmdRetire,
  specBodyPath,
  campaignBodyPath,
  visionBodyPath,
};
