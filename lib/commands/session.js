import fs from 'node:fs';
import path from 'node:path';
import { readAll, append, subjectId } from '../journal.js';
import { derive } from '../state.js';
import { load as loadConfig } from '../config.js';
import { refuse } from '../refuse.js';
import { write } from '../writePath.js';
import { runDir, rolesDir } from '../paths.js';
import { isGitRepo, baseCommit, diffNames, autoCommit } from '../gitops.js';
import { resolveAdapter } from '../adapters/index.js';
import { contentHash, sha256 } from '../hash.js';

// session コマンド束（Tier 0）。start / resume。
// dispatcher 規約: run({ command, positional, flags, root, jsonMode })。
// positional[0]=サブコマンド(start|resume), positional[1]=run-id。
//
// canon 根拠:
//   08 3.10 start/resume の目的・入出力・遷移
//   05 10 章 開始/resume の機械再構成規約（圧縮要約非依存・journal と git から再構成）
//   03 6.1 out/ は compile 生成物領域（gitignore・非正本）
//   06 3.2 session.started / session.resumed / commit.observed が closed set 済み
export async function run(args) {
  const { positional, flags, root, jsonMode } = args;
  if (!root) {
    throw refuse(
      'session',
      [{ input: 'project-context', detail: 'journal/ を持つ root が見つかりません' }],
      ['cc-iasd init']
    );
  }
  const sub = positional[0];
  const runId = positional[1];

  switch (sub) {
    case 'start':
      return cmdStart(root, runId, flags, jsonMode);
    case 'resume':
      return cmdResume(root, runId, flags, jsonMode);
    default:
      throw refuse(
        'session',
        [{ input: 'subcommand', detail: `未知の session サブコマンド: ${sub || '(なし)'}` }],
        ['cc-iasd session start <run-id>', 'cc-iasd session resume <run-id>']
      );
  }
}

// --- 共通ヘルパ ---

function emit(jsonMode, humanText, jsonObj) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(jsonObj) + '\n');
  } else {
    process.stdout.write(humanText);
  }
}

function loadSnapshot(root) {
  return derive(readAll(root));
}

function requireRunId(command, runId) {
  if (!runId) {
    throw refuse(command, [{ input: 'run-id', detail: 'run-id を指定してください' }], [
      `cc-iasd ${command} <run-id>`,
    ]);
  }
}

// start が起動を許す run.status（終端前かつ handoff 合成済み）。
// 05 10 章: 開始は handoff 済み run に対して行う。created（handoff 未合成）は不可。
const STARTABLE_STATES = new Set(['handed-off', 'returned', 'verified']);
// 終端 status（start/resume ともに拒否）。
const TERMINAL_STATES = new Set(['accepted', 'blocked', 'escalated']);

function stopFileExists(root, runId) {
  return fs.existsSync(path.join(runDir(root, runId), 'STOP'));
}

function readWorkerRole(root) {
  const p = path.join(rolesDir(root), 'worker.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function readHandoff(root, runId) {
  const p = path.join(runDir(root, runId), 'handoff.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// runtime 決定順: --runtime フラグ > cfg.runtime.adapter > 'none'（契約 1 章）。
function resolveRuntimeName(flags, cfg) {
  if (typeof flags.runtime === 'string' && flags.runtime.length > 0) return flags.runtime;
  if (cfg.runtime && typeof cfg.runtime.adapter === 'string') return cfg.runtime.adapter;
  return 'none';
}

function autoCommitSafe(root, message) {
  try {
    autoCommit(root, message);
  } catch {
    // git 未初期化（テスト環境等）は致命ではない。
  }
}

// config の repos を name -> { path } に解決する（base は起動時点で再観測する）。
function resolveRepoPaths(root, cfg) {
  const map = {};
  for (const r of cfg.repos || []) {
    const repoPath = path.isAbsolute(r.path) ? r.path : path.resolve(root, r.path);
    map[r.name] = repoPath;
  }
  return map;
}

// 起動時点で run が対象とする repo の HEAD を再観測する。
// UNCOMMITTED（open 時 base が取れなかった）repo は観測をスキップする。
// 対象 repo は run.repos（open 時に焼いた集合）を基準にする。
function observeHeads(root, cfg, runRepos) {
  const paths = resolveRepoPaths(root, cfg);
  const observed = {}; // name -> head
  for (const name of Object.keys(runRepos || {})) {
    const repoPath = paths[name];
    if (!repoPath || !isGitRepo(repoPath)) continue;
    try {
      observed[name] = baseCommit(repoPath);
    } catch {
      // 観測不能はスキップ（UNCOMMITTED 相当）。
    }
  }
  return observed;
}

// session 系 event（started/resumed）の存在有無。resume/start ガードの入力。
function sessionEventsFor(events, runId) {
  const subject = `run:${runId}`;
  return events.filter(
    (e) => e.subject === subject && (e.type === 'session.started' || e.type === 'session.resumed')
  );
}

// --- compile 入力ハッシュ（束2: session resume 入力ハッシュ prefix キャッシュ） ---

// オブジェクトを key 昇順で並べ替えた新オブジェクトを返す（JSON.stringify 決定論化）。
function sortByKey(obj) {
  const out = {};
  for (const k of Object.keys(obj).sort()) out[k] = obj[k];
  return out;
}

// compile 出力（bundle.md + claude-code 時 settings/）を決定づける「安定入力」の
// 正規化ハッシュ集合を算出する（契約 1）。resume-brief は動的入力のため含めない。
//   handoff  : contentHash（frontmatter 除外 + 空白正規化した本文の同一性）
//   roleCard : contentHash（同上）
//   reposBase: key ソート後 JSON の sha256（キー順を固定して決定論化）
//   config   : { docLang, adapter } の sha256（adapter 変更は settings 有無を変える必須入力）
// runtimeName は resolveRuntimeName 解決後の adapter 名を渡す（--runtime 上書き反映）。
function compileInputHashes(ctx, runtimeName) {
  const cfg = ctx.cfg || {};
  return {
    handoff: contentHash(ctx.handoffMd || ''),
    roleCard: contentHash(ctx.roleCard || ''),
    reposBase: sha256(JSON.stringify(sortByKey(ctx.reposBase || {}))),
    config: sha256(JSON.stringify({ docLang: cfg.doc_lang, adapter: runtimeName })),
  };
}

// キャッシュ基準となる直近 inputHashes を返す。
// 基準は「直近の session.resumed が焼いた inputHashes」に限定する。
// 根拠: start 由来の bundle は resume-brief を埋め込まない（compile 時 ctx に
// resumeBriefMd を渡さない）ため、resume が期待する brief 埋込済み bundle とは
// 出力形が異なる。ハッシュ集合は brief 有無を捉えないため、start の inputHashes を
// resume の cache 元にすると brief 未埋込の start bundle を誤って再利用してしまう。
// よって cache 元は brief 埋込済み bundle を生んだ直近 resume に限る（初回 resume は
// prev=null となり必ず再 compile される）。start の inputHashes は監査用途で記録する。
function latestResumedInputHashes(sessionEvents) {
  for (let i = sessionEvents.length - 1; i >= 0; i--) {
    const e = sessionEvents[i];
    if (e.type === 'session.resumed' && e.data && e.data.inputHashes) {
      return e.data.inputHashes;
    }
  }
  return null;
}

// reuse=true 時に既存 compile 生成物から compiled.files を復元する（契約 3-5）。
// out/<run-id>/bundle.md + settings/ 存在時 settings 配下の各ファイル。
function restoreCompiled(root, runId) {
  const bundleDir = path.join('out', runId);
  const files = [path.join('out', runId, 'bundle.md')];
  const settingsAbs = path.join(root, 'out', runId, 'settings');
  if (fs.existsSync(settingsAbs)) {
    const entries = fs
      .readdirSync(settingsAbs, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();
    for (const name of entries) files.push(path.join('out', runId, 'settings', name));
  }
  return { bundleDir, files };
}

// --- session start ---

function cmdStart(root, runId, flags, jsonMode) {
  requireRunId('session start', runId);
  const cfg = loadConfig(root);
  const events = readAll(root);
  const snap = derive(events);
  const runInfo = snap.runs[runId];
  const subject = `run:${runId}`;

  // 前提ガード（決定論）。
  const missing = [];

  // 1) run が存在すること。
  if (!runInfo) {
    throw refuse(
      'session start',
      [{ input: 'run', detail: `run ${runId} が存在しません` }],
      ['cc-iasd run open <campaign-id> --tasks <T..>', 'cc-iasd run open --adhoc "<goal>" --check "<cmd>"']
    );
  }

  // 2) status が起動可能（handed-off / returned / verified）であること。
  //    created は handoff 未合成のため start 不可（run open を促す）。
  //    終端は起動不可。
  if (TERMINAL_STATES.has(runInfo.status)) {
    missing.push({ input: 'run-state', detail: `run は終端 (${runInfo.status}) のため起動できません` });
  } else if (!STARTABLE_STATES.has(runInfo.status)) {
    missing.push({
      input: 'run-state',
      detail: `run 状態=${runInfo.status}（handoff 未合成。run open が必要）`,
    });
  }

  // 3) STOP ファイル不在。
  if (stopFileExists(root, runId)) {
    missing.push({ input: 'stop-file', detail: 'STOP ファイルが存在します' });
  }

  // 4) handoff.md が runs/<run-id>/ に存在すること。
  const handoffMd = readHandoff(root, runId);
  if (handoffMd == null) {
    missing.push({ input: 'handoff.md', detail: `runs/${runId}/handoff.md が存在しません` });
  }

  if (missing.length > 0) {
    throw refuse('session start', missing, [
      `cc-iasd run open ...（run 未生成/handoff 未合成の場合）`,
      `cc-iasd run block ${runId} --missing <ref>`,
    ]);
  }

  // runtime 解決。
  const runtimeName = resolveRuntimeName(flags, cfg);
  const adapter = resolveAdapter(runtimeName);

  // 5) base commit 記録: 起動時点 HEAD を repo ごとに再観測し commit.observed を刻む。
  //    契約 3: start 時点を新 base とし、commit.observed で上書きする（return/verify は
  //    最新 commit.observed base を使う。state.js が commit.observed を run.repos へ畳む）。
  const observed = observeHeads(root, cfg, runInfo.repos);
  if (Object.keys(observed).length > 0) {
    append(root, {
      type: 'commit.observed',
      subject,
      actor: { kind: 'cli' },
      data: { repos: observed },
    });
  }

  // 起動時点 base（observed で上書き後の集合）を bundle/イベントに焼く。
  const reposBase = { ...(runInfo.repos || {}), ...observed };

  // 6) bundle compile（adapter へ委譲。none でも bundle.md を生成する）。
  const roleCard = readWorkerRole(root) || '';
  const ctx = { cfg, snap, handoffMd, roleCard, reposBase, docLang: cfg.doc_lang };
  const compiled = adapter.compile(root, runId, ctx);

  // 7) launch 情報。
  const launch = adapter.launch(root, runId, ctx);
  writeLaunch(root, runId, adapter, launch);

  // 8) session.started event。inputHashes を監査用途で記録する（契約 2）。
  //    start は常に compile するため cache 判定には使わないが、後続 resume が
  //    「start 以降どの入力が変化したか」を照合できるよう痕跡を残す。
  append(root, {
    type: 'session.started',
    subject,
    actor: { kind: 'cli' },
    data: {
      runtime: adapter.name,
      bundleDir: `out/${runId}`,
      repos: reposBase,
      inputHashes: compileInputHashes(ctx, adapter.name),
    },
  });
  autoCommitSafe(root, `session start ${runId}`);

  // 9) stdout 案内。
  const human = renderStartHuman(runId, adapter, compiled, launch);
  emit(jsonMode, human, {
    ok: true,
    command: 'session start',
    run: runId,
    runtime: adapter.name,
    bundleDir: `out/${runId}`,
    files: compiled.files,
    launch: { command: launch.command, cwd: launch.cwd },
    repos: reposBase,
  });
  return { run: runId, runtime: adapter.name, bundleDir: `out/${runId}`, files: compiled.files };
}

// --- session resume ---

function cmdResume(root, runId, flags, jsonMode) {
  requireRunId('session resume', runId);
  const cfg = loadConfig(root);
  const events = readAll(root);
  const snap = derive(events);
  const runInfo = snap.runs[runId];
  const subject = `run:${runId}`;

  // run 存在。
  if (!runInfo) {
    throw refuse(
      'session resume',
      [{ input: 'run', detail: `run ${runId} が存在しません` }],
      [`cc-iasd session start ${runId}`]
    );
  }

  // resume は session.started/resumed が既に 1 件以上あること（未起動 run は不可）。
  const sessionEvents = sessionEventsFor(events, runId);
  if (sessionEvents.length === 0) {
    throw refuse(
      'session resume',
      [{ input: 'session', detail: 'この run はまだ起動していません（session.started が無い）' }],
      [`cc-iasd session start ${runId}`]
    );
  }

  // 終端 run は resume 不可。
  if (TERMINAL_STATES.has(runInfo.status)) {
    throw refuse(
      'session resume',
      [{ input: 'run-state', detail: `run は終端 (${runInfo.status}) のため再開できません` }],
      []
    );
  }

  // STOP ファイル不在。
  if (stopFileExists(root, runId)) {
    throw refuse('session resume', [{ input: 'stop-file', detail: 'STOP ファイルが存在します' }], []);
  }

  const runtimeName = resolveRuntimeName(flags, cfg);
  const adapter = resolveAdapter(runtimeName);

  // compile 入力（安定入力）を組む。resume-brief は動的入力のためハッシュ対象外。
  const handoffMd = readHandoff(root, runId) || '';
  const roleCard = readWorkerRole(root) || '';
  const reposBase = { ...(runInfo.repos || {}) };
  const ctxBase = { cfg, snap, handoffMd, roleCard, reposBase, docLang: cfg.doc_lang };

  // キャッシュ判定（契約 3）: 直近 resume の inputHashes と今回入力を比較する。
  const prevHashes = latestResumedInputHashes(sessionEvents);
  const curHashes = compileInputHashes(ctxBase, adapter.name);
  const changedInputs = prevHashes
    ? Object.keys(curHashes).filter((k) => prevHashes[k] !== curHashes[k])
    : ['(no-prior-hashes)'];

  // resume brief 再コンパイル（journal + git から機械再構成。圧縮要約非依存）。
  // reuse 可否に関わらず常に生成する（brief 再構成は compile ではなく resume の一次成果物）。
  const brief = compileResumeBrief(root, cfg, events, snap, runId, changedInputs);
  const briefRel = path.join('out', runId, 'resume-brief.md');
  write(root, briefRel, brief.markdown);

  // ctx に brief を供給（reuse=false 時の compile 用）。
  const ctx = { ...ctxBase, resumeBriefMd: brief.markdown };

  // reuse 条件: 前回 resume の hashes があり、全入力不変で、既存 bundle.md が在ること。
  const bundleExists = fs.existsSync(path.join(root, 'out', runId, 'bundle.md'));
  const reuse = prevHashes != null && changedInputs.length === 0 && bundleExists;

  let compiled;
  if (reuse) {
    // adapter.compile を呼ばず既存生成物（bundle.md / settings/*）を再利用する。
    compiled = restoreCompiled(root, runId);
    // 監査可視化のため compile-cache hit を note.appended で記録する。
    append(root, {
      type: 'note.appended',
      subject,
      actor: { kind: 'cli' },
      data: { kind: 'compile-cache', run: runId, hit: true },
    });
  } else {
    compiled = adapter.compile(root, runId, ctx);
  }

  // launch 情報は reuse 可否に関わらず毎回最新化する。
  const launch = adapter.launch(root, runId, ctx);
  writeLaunch(root, runId, adapter, launch);

  // session.resumed event。前回 session からの経過情報 + キャッシュ判定結果を data に載せる。
  const prevSession = sessionEvents[sessionEvents.length - 1];
  append(root, {
    type: 'session.resumed',
    subject,
    actor: { kind: 'cli' },
    data: {
      runtime: adapter.name,
      bundleDir: `out/${runId}`,
      resumeBrief: briefRel,
      priorSession: prevSession ? prevSession.id : null,
      diff: brief.diffSummary,
      inputHashes: curHashes,
      compileReused: reuse,
      changedInputs,
    },
  });
  autoCommitSafe(root, `session resume ${runId}`);

  const human = renderResumeHuman(runId, adapter, briefRel, launch);
  emit(jsonMode, human, {
    ok: true,
    command: 'session resume',
    run: runId,
    runtime: adapter.name,
    bundleDir: `out/${runId}`,
    resumeBrief: briefRel,
    files: compiled.files,
    launch: { command: launch.command, cwd: launch.cwd },
  });
  return { run: runId, runtime: adapter.name, resumeBrief: briefRel };
}

// resume brief を journal + git から機械再構成する（05 10 章）。
//   (a) 各 repo の base(commit.observed 最新)からの git diff 概要
//   (b) 最終 verify.recorded の pass/checks
//   (c) 未終端 event（note.appended 要約 / session 系の履歴）
function compileResumeBrief(root, cfg, events, snap, runId, changedInputs) {
  const subject = `run:${runId}`;
  const runInfo = snap.runs[runId] || { repos: {} };
  const repoPaths = resolveRepoPaths(root, cfg);

  // (a) diff 概要。
  const diffSummary = {};
  const diffLines = [];
  for (const [name, base] of Object.entries(runInfo.repos || {})) {
    if (!base || base === 'UNCOMMITTED') {
      diffLines.push(`- ${name}: base 未確定（UNCOMMITTED）`);
      continue;
    }
    const repoPath = repoPaths[name];
    if (!repoPath || !isGitRepo(repoPath)) {
      diffLines.push(`- ${name}: repo path 未解決`);
      continue;
    }
    try {
      const changed = diffNames(repoPath, base);
      diffSummary[name] = { base, changedCount: changed.length, changed };
      diffLines.push(`- ${name}: base=${base} 変更 ${changed.length} 件`);
      for (const f of changed.slice(0, 50)) diffLines.push(`    - ${f}`);
    } catch (e) {
      diffLines.push(`- ${name}: diff 取得失敗（${e.message}）`);
    }
  }
  if (diffLines.length === 0) diffLines.push('(対象 repo なし)');

  // (b) 最終 verify 結果。
  const verifyLines = [];
  const verification = snap.verifications[runId];
  if (verification) {
    verifyLines.push(`最終 verify: pass=${verification.pass}`);
    // verify.recorded の checks を journal から拾う（最新の 1 件）。
    const verifies = events.filter((e) => e.type === 'verify.recorded' && e.subject === subject);
    const last = verifies[verifies.length - 1];
    if (last && last.data && Array.isArray(last.data.checks)) {
      for (const c of last.data.checks) {
        verifyLines.push(`  - check ${c.id}: exit=${c.exit} expect=${c.expect} pass=${c.pass}`);
      }
    }
  } else {
    verifyLines.push('最終 verify: 記録なし');
  }

  // (c) 未終端 event 要約（note.appended / session 系）。
  const noteLines = [];
  const subjEvents = events.filter((e) => e.subject === subject);
  for (const e of subjEvents) {
    if (e.type === 'note.appended') {
      const kind = (e.data && e.data.kind) || 'note';
      noteLines.push(`- note.appended (${kind}) @ ${e.ts}`);
    } else if (e.type === 'session.started') {
      noteLines.push(`- session.started runtime=${(e.data && e.data.runtime) || '?'} @ ${e.ts}`);
    } else if (e.type === 'session.resumed') {
      noteLines.push(`- session.resumed runtime=${(e.data && e.data.runtime) || '?'} @ ${e.ts}`);
    } else if (e.type === 'commit.observed') {
      noteLines.push(`- commit.observed @ ${e.ts}`);
    }
  }
  if (noteLines.length === 0) noteLines.push('(未終端 event なし)');

  // compile 入力の変化（束2）。reuse 時は bundle 再利用のため変化なしと明記する。
  const changeLines = [];
  if (!changedInputs || changedInputs.length === 0) {
    changeLines.push('- 変化なし（bundle 再利用）');
  } else {
    for (const k of changedInputs) changeLines.push(`- ${k}`);
  }

  const md = [
    `---`,
    `id: resume-brief:${runId}`,
    `refs: []`,
    `---`,
    ``,
    `# resume brief: ${runId}`,
    ``,
    `run 状態: ${runInfo.status || '?'}`,
    ``,
    `## base からの差分概要`,
    ``,
    ...diffLines,
    ``,
    `## 最終 verification`,
    ``,
    ...verifyLines,
    ``,
    `## 未終端 event`,
    ``,
    ...noteLines,
    ``,
    `## compile 入力の変化`,
    ``,
    ...changeLines,
    ``,
    `## 再開時の注意`,
    ``,
    `圧縮要約やロール文書のリロードに依存せず、この brief（journal と git から機械再構成）を`,
    `一次情報として作業を再開する。完了宣言はせず run return / verify を要求すること。`,
    ``,
  ].join('\n');

  return { markdown: md, diffSummary };
}

// out/<run-id>/launch.json を書く（adapter の起動情報を記録）。
function writeLaunch(root, runId, adapter, launch) {
  const rel = path.join('out', runId, 'launch.json');
  const payload = {
    runtime: adapter.name,
    capability: adapter.capability,
    command: launch.command,
    cwd: launch.cwd,
    env: launch.env || {},
    note: launch.note,
  };
  write(root, rel, JSON.stringify(payload, null, 2) + '\n');
  return rel;
}

function renderStartHuman(runId, adapter, compiled, launch) {
  const lines = [];
  lines.push(`session started: ${runId}`);
  lines.push(`runtime: ${adapter.name}`);
  if (adapter.fallback) {
    lines.push(`（${adapter.requested || adapter.name} は未実装のため ${adapter.fallback} で代替）`);
  }
  lines.push(`bundle: out/${runId}`);
  lines.push(`  files: ${compiled.files.join(', ')}`);
  lines.push('');
  lines.push(launch.note || '');
  lines.push('');
  return lines.join('\n');
}

function renderResumeHuman(runId, adapter, briefRel, launch) {
  const lines = [];
  lines.push(`session resumed: ${runId}`);
  lines.push(`runtime: ${adapter.name}`);
  lines.push(`resume brief: ${briefRel}`);
  lines.push('');
  lines.push(launch.note || '');
  lines.push('');
  return lines.join('\n');
}

export default run;
