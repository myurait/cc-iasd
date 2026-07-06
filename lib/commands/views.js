import fs from 'node:fs';
import path from 'node:path';
import { readAll, append, subjectKind, subjectId } from '../journal.js';
import { derive } from '../state.js';
import { load as loadConfig } from '../config.js';
import { refuse } from '../refuse.js';
import { write } from '../writePath.js';
import { rolesDir } from '../paths.js';

// views: status(--plan|<ref>) / inbox（引数なし）/ report <ref> / role show <role>
// すべての表示は journal 導出（決定論）。状態遷移は起こさない。

// --- 共有ヘルパ ---------------------------------------------------------

// journal と config を読み込み、導出 snapshot を返す。
function loadContext(root) {
  const events = readAll(root);
  const snapshot = derive(events);
  const config = loadConfig(root);
  return { events, snapshot, config };
}

// event の ts（ISO 文字列）を epoch ms に変換。欠落は 0。
function eventEpoch(ev) {
  if (!ev || !ev.ts) return 0;
  const t = Date.parse(ev.ts);
  return Number.isNaN(t) ? 0 : t;
}

// subject を対象とする journal event の最終 ts（epoch ms）。無ければ 0。
function lastEventEpochFor(events, subject) {
  let last = 0;
  for (const ev of events) {
    if (ev.subject === subject) {
      const e = eventEpoch(ev);
      if (e > last) last = e;
    }
  }
  return last;
}

// run が running（session 起動済みで未終端）かつ stale か判定する。
// 「running」= status が created/handed-off/returned/verified のいずれか（終端前）で
// session.started event が存在する run。stale = 最終 event から stale_minutes 以上経過。
const TERMINAL_RUN_STATUS = new Set(['accepted', 'blocked', 'escalated']);

function isRunning(events, runId, runStatus) {
  if (TERMINAL_RUN_STATUS.has(runStatus)) return false;
  const subject = `run:${runId}`;
  return events.some(
    (ev) => ev.subject === subject && (ev.type === 'session.started' || ev.type === 'session.resumed')
  );
}

// stale 判定は journal の最終 event 時刻から機械算定する（設計 05 10 章）。
function staleMinutes(events, runId, nowMs) {
  const last = lastEventEpochFor(events, `run:${runId}`);
  if (last === 0) return null;
  return Math.floor((nowMs - last) / 60000);
}

// covers/upstream 系 ref の to だけを集める。
function refsByRel(node, rel) {
  if (!node || !Array.isArray(node.refs)) return [];
  return node.refs.filter((r) => r && r.rel === rel).map((r) => r.to);
}

// --- ハンドラ本体 -------------------------------------------------------

export async function run(ctx) {
  const { command, positional, flags, root, jsonMode } = ctx;

  if (root == null) {
    // project-context root が見つからない。init を促す。
    throw refuse('cc-iasd', [{ input: 'project-context', detail: 'journal/ を持つ root が見つかりません' }], [
      'cc-iasd init <project-context-path>',
    ]);
  }

  switch (command) {
    case 'status':
      return cmdStatus({ positional, flags, root, jsonMode });
    case 'inbox':
      return cmdInbox({ root, jsonMode });
    case 'report':
      return cmdReport({ positional, root, jsonMode });
    case 'role':
      return cmdRole({ positional, root, jsonMode });
    default:
      throw new Error(`views: 未対応のコマンド: ${command}`);
  }
}

export default run;

// --- status ------------------------------------------------------------

function cmdStatus({ positional, flags, root, jsonMode }) {
  const { events, snapshot, config } = loadContext(root);
  const nowMs = Date.now();

  // --plan: 中期計画ビュー
  if (flags.plan) {
    return statusPlan({ snapshot, jsonMode });
  }

  // <ref> 指定: 単一ノード view
  const ref = positional[0];
  if (ref) {
    return statusRef({ events, snapshot, config, ref, nowMs, jsonMode });
  }

  // 引数なし: 全体 view
  return statusOverview({ events, snapshot, config, nowMs, jsonMode });
}

// 全体 view: nodes / runs / gaps を導出のまま提示し、stale run を明示。
function statusOverview({ events, snapshot, config, nowMs, jsonMode }) {
  const threshold = config.budgets.session_stale_minutes;
  const runViews = [];
  for (const [rid, run] of Object.entries(snapshot.runs)) {
    const running = isRunning(events, rid, run.status);
    const mins = staleMinutes(events, rid, nowMs);
    const stale = running && mins != null && mins >= threshold;
    runViews.push({
      id: rid,
      status: run.status,
      type: run.type || 'normal',
      campaign: run.campaign || null,
      running,
      stale_minutes: mins,
      stale,
    });
  }
  runViews.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const nodeViews = Object.entries(snapshot.nodes)
    .filter(([subject]) => subjectKind(subject) !== 'run')
    .map(([subject, n]) => ({ subject, status: n.status }))
    .sort((a, b) => (a.subject < b.subject ? -1 : 1));

  const gapViews = Object.entries(snapshot.gaps)
    .map(([gid, g]) => ({
      id: gid,
      status: g.status,
      kind: g.kind,
      route: g.route,
      blocking: !!g.blocking,
      target: g.target,
    }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const out = { ok: true, view: 'status', nodes: nodeViews, runs: runViews, gaps: gapViews };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(out) + '\n');
    return out;
  }

  const lines = ['status:', '', 'nodes:'];
  if (nodeViews.length === 0) lines.push('  (なし)');
  for (const n of nodeViews) lines.push(`  ${n.subject}  [${n.status}]`);
  lines.push('', 'runs:');
  if (runViews.length === 0) lines.push('  (なし)');
  for (const r of runViews) {
    const flags = [];
    if (r.type !== 'normal') flags.push(r.type);
    if (r.stale) flags.push(`stale(${r.stale_minutes}m)`);
    else if (r.running) flags.push('running');
    const suffix = flags.length ? `  {${flags.join(', ')}}` : '';
    lines.push(`  run:${r.id}  [${r.status}]${suffix}`);
  }
  lines.push('', 'gaps:');
  if (gapViews.length === 0) lines.push('  (なし)');
  for (const g of gapViews) {
    const b = g.blocking ? ' blocking' : '';
    lines.push(`  gap:${g.id}  [${g.status}] kind=${g.kind} route=${g.route}${b} -> ${g.target || '?'}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
  return out;
}

// 単一 ref view: 対象ノードの status と、可能遷移の提示（in-band 知識供給）。
function statusRef({ events, snapshot, ref, nowMs, jsonMode }) {
  const kind = subjectKind(ref);
  let node = snapshot.nodes[ref];
  let runInfo = null;

  if (kind === 'run') {
    const rid = subjectId(ref);
    runInfo = snapshot.runs[rid];
    if (!runInfo && !node) {
      throw refuse('status', [{ input: 'ref', detail: `${ref} は journal に存在しません` }], [
        'cc-iasd status',
      ]);
    }
  } else if (kind === 'gap') {
    const g = snapshot.gaps[subjectId(ref)];
    if (!g) {
      throw refuse('status', [{ input: 'ref', detail: `${ref} は journal に存在しません` }], [
        'cc-iasd status',
      ]);
    }
    const out = { ok: true, view: 'status', ref, status: g.status, gap: g };
    emitRefView(out, jsonMode);
    return out;
  } else if (!node) {
    throw refuse('status', [{ input: 'ref', detail: `${ref} は journal に存在しません` }], [
      'cc-iasd status',
    ]);
  }

  const status = runInfo ? runInfo.status : node ? node.status : 'unknown';
  const next = nextCommandsFor(kind, status, ref, runInfo);

  const out = {
    ok: true,
    view: 'status',
    ref,
    kind,
    status,
    refs: (node && node.refs) || [],
    next,
  };
  if (runInfo) {
    const running = isRunning(events, subjectId(ref), status);
    const mins = staleMinutes(events, subjectId(ref), nowMs);
    out.run = { type: runInfo.type || 'normal', campaign: runInfo.campaign || null, running, stale_minutes: mins };
  }
  emitRefView(out, jsonMode);
  return out;
}

function emitRefView(out, jsonMode) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(out) + '\n');
    return;
  }
  const lines = [`status: ${out.ref}  [${out.status}]`];
  if (out.run) {
    const r = out.run;
    const s = [];
    if (r.type !== 'normal') s.push(r.type);
    if (r.running) s.push('running');
    if (r.stale_minutes != null) s.push(`最終eventから ${r.stale_minutes}m`);
    if (s.length) lines.push(`  ${s.join(' / ')}`);
  }
  if (out.gap) {
    lines.push(`  kind=${out.gap.kind} route=${out.gap.route} blocking=${!!out.gap.blocking}`);
  }
  if (Array.isArray(out.next) && out.next.length) {
    lines.push('可能な次の一手:');
    for (const n of out.next) lines.push(`  $ ${n}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
}

// 現在状態から取り得る遷移コマンドを提示（設計 08 9 章 in-band 知識供給）。
function nextCommandsFor(kind, status, ref, runInfo) {
  const id = subjectId(ref);
  if (kind === 'spec') {
    if (status === 'draft') return [`cc-iasd review record ${ref} --gate spec`, `cc-iasd spec ready ${id}`];
    return [];
  }
  if (kind === 'vision') {
    if (status === 'draft') return ['cc-iasd decide <decision-id>  # 人間承認'];
    return [];
  }
  if (kind === 'campaign') {
    if (status === 'draft') return [`cc-iasd review record ${ref} --gate launch`, `cc-iasd campaign launch ${id}`];
    if (status === 'active') return [`cc-iasd run open ${id} --tasks <T..>`, `cc-iasd campaign close ${id}`];
    return [];
  }
  if (kind === 'run') {
    const s = runInfo ? runInfo.status : status;
    switch (s) {
      case 'created':
        return [`cc-iasd run handoff ${id}`, `cc-iasd session start ${id}`];
      case 'handed-off':
        return [`cc-iasd run return ${id}`];
      case 'returned':
        return [`cc-iasd run verify ${id}`];
      case 'verified':
        return [
          `cc-iasd review record run:${id} --gate run`,
          `cc-iasd run accept ${id}`,
          `cc-iasd run block ${id} --missing <ref>`,
          `cc-iasd run escalate ${id}`,
        ];
      default:
        return [];
    }
  }
  return [];
}

// --plan: route=vision の routed/open gap（中期計画在庫）と campaign の
// depends_on / coverage 順序を射影する。
function statusPlan({ snapshot, jsonMode }) {
  // route=vision の gap（closed 以外を計画在庫として列挙）。
  const planGaps = Object.entries(snapshot.gaps)
    .filter(([, g]) => g.route === 'vision' && g.status !== 'closed')
    .map(([gid, g]) => ({ id: gid, status: g.status, kind: g.kind, blocking: !!g.blocking, target: g.target }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  // campaign の depends_on / coverage を refs から射影し、実現順序を組む。
  const campaigns = [];
  for (const [subject, node] of Object.entries(snapshot.nodes)) {
    if (subjectKind(subject) !== 'campaign') continue;
    const dependsOn = refsByRel(node, 'depends_on');
    const coverage = refsByRel(node, 'covers');
    campaigns.push({
      id: subjectId(subject),
      subject,
      status: node.status,
      depends_on: dependsOn,
      coverage,
    });
  }
  campaigns.sort((a, b) => (a.id < b.id ? -1 : 1));

  // depends_on による決定論的トポロジ順序（closed でない依存が残るものは blocked 表示）。
  const statusBySubject = {};
  for (const c of campaigns) statusBySubject[c.subject] = c.status;
  const ordered = topoOrder(campaigns, statusBySubject);

  const out = { ok: true, view: 'plan', plan_gaps: planGaps, campaigns: ordered };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(out) + '\n');
    return out;
  }

  const lines = ['中期計画ビュー (--plan):', '', 'route=vision の計画在庫 gap:'];
  if (planGaps.length === 0) lines.push('  (なし)');
  for (const g of planGaps) {
    lines.push(`  gap:${g.id}  [${g.status}] kind=${g.kind} -> ${g.target || '?'}`);
  }
  lines.push('', 'campaign 実現順序 (depends_on / coverage):');
  if (ordered.length === 0) lines.push('  (なし)');
  for (const c of ordered) {
    const dep = c.depends_on.length ? ` depends_on=[${c.depends_on.join(', ')}]` : '';
    const cov = c.coverage.length ? ` coverage=[${c.coverage.join(', ')}]` : '';
    const blocked = c.blocked_by && c.blocked_by.length ? `  (未充足依存: ${c.blocked_by.join(', ')})` : '';
    lines.push(`  ${c.order}. campaign:${c.id}  [${c.status}]${dep}${cov}${blocked}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
  return out;
}

// depends_on の決定論的順序付け。closed でない依存を blocked_by として明示する。
function topoOrder(campaigns, statusBySubject) {
  const byId = {};
  for (const c of campaigns) byId[c.id] = c;
  const result = [];
  const placed = new Set();

  // 依存が全て placed になった campaign から順に配置。循環・未解決は後段に残す。
  let progress = true;
  while (placed.size < campaigns.length && progress) {
    progress = false;
    for (const c of campaigns) {
      if (placed.has(c.id)) continue;
      const depIds = c.depends_on.map((d) => subjectId(d)).filter((x) => byId[x]);
      const unmet = depIds.filter((d) => !placed.has(d));
      if (unmet.length === 0) {
        result.push(c);
        placed.add(c.id);
        progress = true;
      }
    }
  }
  // 循環等で残ったものを末尾に付す（順序不定だが決定論的に id 昇順）。
  for (const c of campaigns) {
    if (!placed.has(c.id)) result.push(c);
  }

  return result.map((c, i) => {
    // closed でない依存を blocked_by として列挙（launch 順序制約の可視化）。
    const blockedBy = c.depends_on.filter((d) => {
      const st = statusBySubject[d];
      return st !== undefined && st !== 'closed';
    });
    return { ...c, order: i + 1, blocked_by: blockedBy };
  });
}

// --- inbox（引数なし cc-iasd）-----------------------------------------

function cmdInbox({ root, jsonMode }) {
  const { events, snapshot, config } = loadContext(root);
  const nowMs = Date.now();
  const threshold = config.budgets.session_stale_minutes;

  // open decisions（decided でない decision ノード）
  const openDecisions = Object.entries(snapshot.nodes)
    .filter(([subject, n]) => subjectKind(subject) === 'decision' && n.status !== 'decided')
    .map(([subject]) => subject)
    .sort();

  // escalations（escalated 状態の run）
  const escalations = Object.entries(snapshot.runs)
    .filter(([, r]) => r.status === 'escalated')
    .map(([rid]) => `run:${rid}`)
    .sort();

  // stale runs（running かつ stale）
  const staleRuns = [];
  for (const [rid, r] of Object.entries(snapshot.runs)) {
    if (!isRunning(events, rid, r.status)) continue;
    const mins = staleMinutes(events, rid, nowMs);
    if (mins != null && mins >= threshold) staleRuns.push({ id: `run:${rid}`, stale_minutes: mins });
  }
  staleRuns.sort((a, b) => (a.id < b.id ? -1 : 1));

  // close 待ち campaign（active な campaign）
  const closeWaiting = Object.entries(snapshot.nodes)
    .filter(([subject, n]) => subjectKind(subject) === 'campaign' && n.status === 'active')
    .map(([subject]) => subject)
    .sort();

  // 未読 report（report:<...> の created が存在するもの。P1 は既読管理を持たないため
  // 生成済み report を「要確認」として列挙する）
  const reports = Object.entries(snapshot.nodes)
    .filter(([subject]) => subjectKind(subject) === 'report')
    .map(([subject]) => subject)
    .sort();

  const out = {
    ok: true,
    view: 'inbox',
    open_decisions: openDecisions,
    escalations,
    stale_runs: staleRuns,
    close_waiting_campaigns: closeWaiting,
    reports,
  };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(out) + '\n');
    return out;
  }

  const isTTY = !!(process.stdout && process.stdout.isTTY);
  const lines = ['cc-iasd inbox — 要対応事項', ''];

  const section = (title, items, fmt) => {
    lines.push(`${title}:`);
    if (!items || items.length === 0) {
      lines.push('  (なし)');
    } else {
      for (const it of items) lines.push('  ' + fmt(it));
    }
    lines.push('');
  };

  section('open decisions', openDecisions, (d) => `${d}  ->  cc-iasd decide ${subjectId(d)}`);
  section('escalations', escalations, (r) => `${r}  ->  cc-iasd decide <decision-id>`);
  section('stale runs', staleRuns, (r) => `${r.id}  (最終eventから ${r.stale_minutes}m)`);
  section('close 待ち campaign', closeWaiting, (c) => `${c}  ->  cc-iasd campaign close ${subjectId(c)}`);
  section('report (要確認)', reports, (r) => `${r}`);

  if (isTTY) {
    lines.push('対話操作: 上記の decide / campaign close を実行できます。');
    lines.push('（P1 は一覧 + 次コマンド提示まで。対話実行は各コマンドを直接起動してください）');
  } else {
    lines.push('（非 TTY: 上記の次コマンドを直接実行してください）');
  }

  process.stdout.write(lines.join('\n') + '\n');
  return out;
}

// --- report <ref> ------------------------------------------------------

// report skeleton を生成し、tool-owned 欄を journal / verification / off-surface から
// 機械記入する（設計 06 7.1）。created event（subject=report:<ref>）を記録する。
function cmdReport({ positional, root, jsonMode }) {
  const ref = positional[0];
  if (!ref) {
    throw refuse('report', [{ input: 'ref', detail: '対象 ref（run:<id> または campaign:<id>）が必要です' }], [
      'cc-iasd report run:<run-id>',
      'cc-iasd report campaign:<campaign-id>',
    ]);
  }

  const { events, snapshot, config } = loadContext(root);
  const kind = subjectKind(ref);

  // 対象存在の検査（run / campaign のみ report 対象）。
  if (kind === 'run') {
    if (!snapshot.runs[subjectId(ref)]) {
      throw refuse('report', [{ input: 'ref', detail: `${ref} は journal に存在しません` }], ['cc-iasd status']);
    }
  } else if (kind === 'campaign') {
    if (!snapshot.nodes[ref]) {
      throw refuse('report', [{ input: 'ref', detail: `${ref} は journal に存在しません` }], ['cc-iasd status']);
    }
  } else {
    throw refuse(
      'report',
      [{ input: 'ref', detail: 'report は run:<id> または campaign:<id> のみを対象にします' }],
      ['cc-iasd report run:<run-id>', 'cc-iasd report campaign:<campaign-id>']
    );
  }

  const toolOwned = buildToolOwned(ref, kind, snapshot, events);
  const md = renderReport(ref, kind, toolOwned, config.doc_lang);

  // out/<run-id>/report.md（run）または out/<campaign-id>/report.md（campaign）。
  const relPath = path.join('out', subjectId(ref), 'report.md');
  write(root, relPath, md);

  // created event（状態遷移は起こさない。契約 5 章）。
  append(root, {
    type: 'created',
    subject: `report:${subjectId(ref)}`,
    actor: { kind: 'cli' },
    data: { source: ref, kind },
    refs: [{ rel: 'reports', to: ref }],
  });

  const out = { ok: true, view: 'report', ref, path: relPath, tool_owned: toolOwned };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(out) + '\n');
    return out;
  }
  process.stdout.write(`report skeleton を生成しました: ${relPath}\n`);
  process.stdout.write('tool-owned 欄は CLI が記入済み。authored 欄を執筆してください。\n');
  return out;
}

// tool-owned 欄を journal / verification / off-surface から機械合成する。
function buildToolOwned(ref, kind, snapshot, events) {
  const id = subjectId(ref);
  const owned = {
    source_refs: [ref],
    verification_refs: [],
    review_refs: [],
    off_surface: [],
    gap_refs: [],
  };

  // 対象 run の集合（campaign なら coverage 配下ではなく campaign 紐付き run を集める）。
  const targetRunIds =
    kind === 'run'
      ? [id]
      : Object.entries(snapshot.runs)
          .filter(([, r]) => r.campaign === id)
          .map(([rid]) => rid);

  for (const rid of targetRunIds) {
    const runSubject = `run:${rid}`;
    // verification 参照（verify.recorded を持つ run）。
    if (snapshot.verifications[rid]) {
      owned.verification_refs.push(`evidence/verifications/${rid}`);
      if (kind === 'run') owned.source_refs.push(runSubject);
    }
    // review record 参照（run gate）。
    if (snapshot.reviews[runSubject] && snapshot.reviews[runSubject].run) {
      owned.review_refs.push(`review:${runSubject}#run`);
    }
    // off-surface（verdict から自動列挙された変更面）。verify が保存した verdict を読む。
    const off = readOffSurface(events, rid);
    for (const o of off) owned.off_surface.push(o);
  }

  // campaign report は completion review record も参照する。
  if (kind === 'campaign') {
    if (snapshot.reviews[ref] && snapshot.reviews[ref].completion) {
      owned.review_refs.push(`review:${ref}#completion`);
    }
    if (snapshot.reviews[ref] && snapshot.reviews[ref].launch) {
      owned.review_refs.push(`review:${ref}#launch`);
    }
  }

  // 関連 gap（対象 ref を target とする gap、または target が対象 run のもの）。
  for (const [gid, g] of Object.entries(snapshot.gaps)) {
    if (g.target === ref) owned.gap_refs.push(`gap:${gid}`);
    else if (kind === 'campaign' && targetRunIds.some((rid) => g.target === `run:${rid}`)) {
      owned.gap_refs.push(`gap:${gid}`);
    }
  }

  // 重複除去
  owned.source_refs = [...new Set(owned.source_refs)];
  owned.verification_refs = [...new Set(owned.verification_refs)];
  owned.review_refs = [...new Set(owned.review_refs)];
  owned.off_surface = [...new Set(owned.off_surface)];
  owned.gap_refs = [...new Set(owned.gap_refs)];
  return owned;
}

// verdict JSON の surface.offSurface を journal 経由ではなく evidence から読む。
// evidence パスは verify が固定生成する（lib/verify.js）。
function readOffSurface(events, runId) {
  // verify.recorded event に off-surface が焼かれていればそれを使う。
  for (const ev of events) {
    if (ev.subject === `run:${runId}` && ev.type === 'verify.recorded') {
      if (ev.data && Array.isArray(ev.data.off_surface)) return ev.data.off_surface;
      if (ev.data && ev.data.surface && Array.isArray(ev.data.surface.offSurface)) {
        return ev.data.surface.offSurface;
      }
    }
  }
  return [];
}

function renderReport(ref, kind, owned, docLang) {
  const list = (arr) => (arr && arr.length ? arr.join(', ') : '(なし)');
  const parts = [];
  parts.push(`---\nid: report:${subjectId(ref)}\nrefs:\n  - { rel: reports, to: ${ref} }\n---\n`);
  parts.push(`# report: ${ref}\n`);
  parts.push(
    `<!-- report は ${kind} の終端 packet（completion / escalation / backtrack のいずれか）。\n` +
      `     tool-owned 欄は CLI が記入済み。authored 欄を AI が執筆する。出力言語は ${docLang}。 -->\n`
  );

  // tool-owned（機械記入済み）
  parts.push('## tool-owned\n');
  parts.push('<!-- CLI が記入。編集しないこと。 -->\n');
  parts.push('```text');
  parts.push(`source refs:             ${list(owned.source_refs)}`);
  parts.push(`verification 結果への参照: ${list(owned.verification_refs)}`);
  parts.push(`review record への参照:   ${list(owned.review_refs)}`);
  parts.push(`off-surface 変更面:       ${list(owned.off_surface)}`);
  parts.push(`gap への参照:             ${list(owned.gap_refs)}`);
  parts.push('```\n');

  // authored（AI が執筆）
  parts.push('## authored\n');
  parts.push('<!-- AI が執筆する。 -->\n');
  parts.push('### scope summary\n\n<!-- 実装・処理した範囲の要約を記す。 -->\n');
  parts.push('### completion assessment\n\n<!-- 完了状態の評価を記す。 -->\n');
  parts.push('### 軽微判断の記録\n\n<!-- run 内で自律的に下した軽微な判断を記す。 -->\n');
  parts.push('### 残リスク\n\n<!-- 残存するリスクを記す。 -->\n');
  parts.push(
    '### 人間が確認すべき点\n\n<!-- 人間の確認を要する点を記す。planning 層への還流事項があれば\n' +
      '     gap を route 付きで起票する（本文には書かない）。 -->\n'
  );

  return parts.join('\n');
}

// --- role show ---------------------------------------------------------

const ROLE_NAMES = new Set(['planner', 'worker', 'reviewer']);

function cmdRole({ positional, root, jsonMode }) {
  // 構文: role show <planner|worker|reviewer>
  const sub = positional[0];
  const roleName = positional[1];

  if (sub !== 'show') {
    throw refuse('role', [{ input: 'サブコマンド', detail: `role の操作は show のみです（受領: ${sub || '(なし)'}）` }], [
      'cc-iasd role show planner|worker|reviewer',
    ]);
  }
  if (!roleName || !ROLE_NAMES.has(roleName)) {
    throw refuse(
      'role show',
      [{ input: 'role', detail: `planner|worker|reviewer のいずれかが必要です（受領: ${roleName || '(なし)'}）` }],
      ['cc-iasd role show planner', 'cc-iasd role show worker', 'cc-iasd role show reviewer']
    );
  }

  const cardPath = path.join(rolesDir(root), `${roleName}.md`);
  if (!fs.existsSync(cardPath)) {
    throw refuse('role show', [{ input: 'role card', detail: `${roleName}.md が roles/ に存在しません` }], [
      'cc-iasd init',
    ]);
  }

  const raw = fs.readFileSync(cardPath, 'utf8');
  const config = tryLoadConfig(root);
  const rendered = renderRoleCard(raw, config);

  const out = { ok: true, view: 'role', role: roleName, card: rendered };
  if (jsonMode) {
    process.stdout.write(JSON.stringify(out) + '\n');
    return out;
  }
  process.stdout.write(rendered + (rendered.endsWith('\n') ? '' : '\n'));
  return out;
}

// role card 内の {{docLang}} を実 config で置換する（init が確定した doc_lang）。
function renderRoleCard(raw, config) {
  const docLang = (config && config.doc_lang) || 'Japanese';
  return String(raw).replace(/\{\{\s*docLang\s*\}\}/g, docLang);
}

function tryLoadConfig(root) {
  try {
    return loadConfig(root);
  } catch {
    return null;
  }
}
