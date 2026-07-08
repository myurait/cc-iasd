import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// P3 統合 e2e（実 CLI）。4 系統の並列実装（--json 統一 / session+Tier1 adapter /
// worktree 隔離 / P4 監査強化）が同一 CLI 経路で結線して動くことを検証する:
//   (i)   run open --adhoc -> session start（adapter=none）で out/<run-id>/bundle.md 生成
//   (ii)  --runtime claude-code で out/<run-id>/settings/ に settings + hook 生成
//   (iii) run open --isolate -> worktree 上での return / verify 完走
//   (iv)  doctor が新監査検査込みで green
//   (v)   run 系の --json 出力がパース可能な単一 JSON
//
// 設計正本: 03 6.1（out/<run-id>/ レイアウト）/ 03 3.6（runtime.adapter 許容集合）/
// 05 7 章（worktree 隔離の上乗せ・conflict の verify 検出）/ 05 10 章（session lifecycle・
// commit.observed base 記録）/ 06 3.2（session/commit event data）/ 08 3.8・3.10（run open
// --worktree / session start・resume）。すべて一時 project-context を --root にして実行し
// repo 直下は汚さない。

const BIN = path.resolve(fileURLToPath(new URL('../bin/cc-iasd.js', import.meta.url)));
const OK_CHECK = 'node -e "process.exit(0)"';

function cli(root, args, extraFlags = ['--json']) {
  try {
    const stdout = execFileSync(process.execPath, [BIN, ...args, '--root', root, ...extraFlags], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: e.stdout ? String(e.stdout) : '',
      stderr: e.stderr ? String(e.stderr) : '',
    };
  }
}

function assertOk(r, label) {
  assert.equal(r.status, 0, `${label} は成功すべき: exit=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  return r;
}

function lastLine(stdout) {
  return stdout.trim().split('\n').filter(Boolean).pop() || '';
}

// stdout 全体が「改行 1 個で終わる単一 JSON オブジェクト」であることを検査してパースする。
function parseSingleJson(stdout, label) {
  const trimmed = stdout.replace(/\n$/, '');
  assert.ok(!trimmed.includes('\n'), `${label} は単一行 JSON であるべき: ${JSON.stringify(stdout)}`);
  let obj;
  assert.doesNotThrow(() => {
    obj = JSON.parse(trimmed);
  }, `${label} はパース可能な JSON であるべき: ${JSON.stringify(stdout)}`);
  return obj;
}

function tmpRoot(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cc-e2ep3-${tag}-`));
}

// require_tty=false / repo 登録つきで init する（adapter は引数で切替）。
function initProject(root, { adapter = 'none' } = {}) {
  assertOk(cli(root, ['init', '--repo', 'api:src/api'], ['--json']), 'init');
  fs.writeFileSync(
    path.join(root, 'cc-iasd.yaml'),
    [
      'doc_lang: Japanese',
      'dev_lang: TypeScript',
      'repos:',
      '  - { name: api, path: src/api }',
      'checks_allowlist: ["npm ", "npx ", "node ", "git "]',
      // run gate は none（adhoc run を run-gate review record なしで accept できるようにする。
      // 本 e2e の焦点は P3 統合であり run gate の chain は e2e-chain が検証する）。
      'gates: { spec: required, run: none }',
      `runtime: { adapter: ${adapter} }`,
      'decision: { require_tty: false, allow_adopt: false }',
      '',
    ].join('\n')
  );
}

// src/api を nested git repo として base 1 commit で初期化する。
function initSrcRepo(root) {
  const repoPath = path.join(root, 'src', 'api');
  fs.mkdirSync(repoPath, { recursive: true });
  const g = (a) => execFileSync('git', a, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
  g(['init', '-q']);
  g(['config', 'user.name', 'test']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoPath, 'base.txt'), 'a\nb\nc\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  return repoPath;
}

// worktree 内で実装を行い commit する（隔離ブランチ側の作業を模す）。
function implementInWorktree(wtPath, relFile, content) {
  const abs = path.join(wtPath, relFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  const g = (a) => execFileSync('git', a, { cwd: wtPath, stdio: ['ignore', 'pipe', 'pipe'] });
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'impl']);
}

// run の notes.md を非空にする（run return の notes ガードを満たす）。
function writeNotes(root, runId, body) {
  const p = path.join(root, 'runs', runId, 'notes.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

// --- (i) session start（adapter=none）で out/<run-id>/bundle.md が生成される ---

test('(i) run open --adhoc -> session start(none) で out/<run-id>/bundle.md が生成される', () => {
  const root = tmpRoot('none');
  initProject(root, { adapter: 'none' });

  const opened = parseSingleJson(
    assertOk(cli(root, ['run', 'open', '--adhoc', 'ブートストラップ調査', '--check', OK_CHECK]), 'run open').stdout,
    'run open --json'
  );
  assert.equal(opened.ok, true);
  assert.equal(opened.command, 'run open');
  const runId = opened.run;
  assert.match(runId, /^r-/);

  const started = parseSingleJson(
    assertOk(cli(root, ['session', 'start', runId]), 'session start').stdout,
    'session start --json'
  );
  assert.equal(started.ok, true);
  assert.equal(started.command, 'session start');
  assert.equal(started.runtime, 'none');
  assert.equal(started.bundleDir, `out/${runId}`);

  // out/<run-id>/bundle.md が実在する。
  const bundle = path.join(root, 'out', runId, 'bundle.md');
  assert.ok(fs.existsSync(bundle), `bundle.md が out/${runId}/ に生成されるべき`);
  const body = fs.readFileSync(bundle, 'utf8');
  assert.match(body, /## handoff/);
  assert.match(body, /runtime adapter: none/);

  // launch.json も出る（起動情報の記録）。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'launch.json')), 'launch.json が生成されるべき');

  // session.started event が journal に刻まれる。
  const startedFiles = fs
    .readdirSync(path.join(root, 'journal'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'journal', f), 'utf8')))
    .filter((e) => e.type === 'session.started' && e.subject === `run:${runId}`);
  assert.equal(startedFiles.length, 1, 'session.started が 1 件刻まれるべき');
  assert.equal(startedFiles[0].data.runtime, 'none');
  assert.equal(startedFiles[0].data.bundleDir, `out/${runId}`);
});

// --- (ii) claude-code adapter で settings / hook が out/ に生成される ---

test('(ii) session start --runtime claude-code で out/<run-id>/settings/ に settings + hook が出る', () => {
  const root = tmpRoot('cc');
  initProject(root, { adapter: 'none' }); // 既定 none、start 時に --runtime で上書き

  const runId = parseSingleJson(
    assertOk(cli(root, ['run', 'open', '--adhoc', 'claude-code 起動', '--check', OK_CHECK]), 'run open').stdout,
    'run open'
  ).run;

  const started = parseSingleJson(
    assertOk(cli(root, ['session', 'start', runId], ['--runtime', 'claude-code', '--json']), 'session start cc').stdout,
    'session start claude-code'
  );
  assert.equal(started.runtime, 'claude-code');

  // settings.json と write-guard hook が out/<run-id>/settings/ に生成される。
  const settingsJson = path.join(root, 'out', runId, 'settings', 'settings.json');
  const hook = path.join(root, 'out', runId, 'settings', 'write-guard.mjs');
  assert.ok(fs.existsSync(settingsJson), 'settings/settings.json が生成されるべき');
  assert.ok(fs.existsSync(hook), 'settings/write-guard.mjs が生成されるべき');

  const settings = JSON.parse(fs.readFileSync(settingsJson, 'utf8'));
  assert.ok(settings.hooks && Array.isArray(settings.hooks.PreToolUse), 'PreToolUse hook が登録されるべき');
  assert.equal(settings.cc_iasd.run, runId, 'settings に対象 run が記録されるべき');

  // bundle.md も並存する（claude-code は none の bundle を共有する）。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'bundle.md')), 'bundle.md が並存すべき');
});

// --- (iii) run open --isolate -> worktree 上で return / verify 完走 ---

test('(iii) run open --isolate は worktree を張り return / verify が worktree 上で完走する', () => {
  const root = tmpRoot('iso');
  initProject(root, { adapter: 'none' });
  initSrcRepo(root);

  // surface を src/api/ に向けて worktree run を開く。
  const opened = parseSingleJson(
    assertOk(
      cli(root, [
        'run', 'open',
        '--adhoc', '隔離実装',
        '--check', OK_CHECK,
        '--surface', 'src/api/**',
        '--isolate',
      ]),
      'run open --isolate'
    ).stdout,
    'run open --isolate'
  );
  const runId = opened.run;

  // created.data.worktree が焼かれ、worktree 実体が out/<run-id>/wt/api に張られる。
  const createdFiles = fs
    .readdirSync(path.join(root, 'journal'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'journal', f), 'utf8')))
    .filter((e) => e.type === 'created' && e.subject === `run:${runId}`);
  assert.equal(createdFiles.length, 1);
  const wt = createdFiles[0].data.worktree;
  assert.ok(wt && wt.api, 'created.data.worktree.api が記録されるべき');
  const wtAbs = path.isAbsolute(wt.api.path) ? wt.api.path : path.join(root, wt.api.path);
  assert.ok(fs.existsSync(wtAbs), `worktree 実体が ${wt.api.path} に張られるべき`);
  assert.equal(wt.api.branch, `ccisad/${runId}`);

  // worktree 内で src の実装（surface 内）を行い commit する。
  implementInWorktree(wtAbs, path.join('src', 'api', 'feature.txt'), 'x\n');
  // notes.md を書いて return の notes ガードを満たす。
  writeNotes(root, runId, '# notes\n隔離ブランチで feature.txt を追加した。\n');

  // return（worktree 内 diff snapshot）。
  const returned = parseSingleJson(
    assertOk(cli(root, ['run', 'return', runId]), 'run return').stdout,
    'run return'
  );
  assert.equal(returned.ok, true);
  assert.equal(returned.to, 'returned');

  // verify（worktree 内 checks + merge dry-run）。conflict なしなので pass。
  const verified = parseSingleJson(
    assertOk(cli(root, ['run', 'verify', runId]), 'run verify').stdout,
    'run verify'
  );
  assert.equal(verified.ok, true);
  assert.equal(verified.pass, true, `verify は pass すべき: ${JSON.stringify(verified)}`);
  assert.ok(!verified.mergeConflicts, 'conflict なしなら mergeConflicts は無いべき');

  // accept（worktree ブランチを base へ merge し掃除）。
  const accepted = parseSingleJson(
    assertOk(cli(root, ['run', 'accept', runId]), 'run accept').stdout,
    'run accept'
  );
  assert.equal(accepted.ok, true);
  assert.equal(accepted.to, 'accepted');

  // base ブランチ本体に feature.txt が merge されている。
  const merged = fs.existsSync(path.join(root, 'src', 'api', 'src', 'api', 'feature.txt'));
  assert.ok(merged, 'accept 後に隔離ブランチが base へ merge されているべき');
});

// --- (iv) doctor が新監査検査込みで green ---

test('(iv) 完走した project-context で doctor が新監査検査込み green', () => {
  const root = tmpRoot('doctor');
  initProject(root, { adapter: 'none' });
  initSrcRepo(root);

  // adhoc run を 1 本完走させる（verification + accept の DEMM 証跡を作る）。
  const runId = parseSingleJson(
    assertOk(
      cli(root, ['run', 'open', '--adhoc', 'doctor 用 run', '--check', OK_CHECK, '--surface', 'src/api/**']),
      'run open'
    ).stdout,
    'run open'
  ).run;
  writeNotes(root, runId, '# notes\ndoctor 検査用の run。\n');
  assertOk(cli(root, ['run', 'return', runId]), 'run return');
  const v = parseSingleJson(assertOk(cli(root, ['run', 'verify', runId]), 'run verify').stdout, 'verify');
  assert.equal(v.pass, true);
  assertOk(cli(root, ['run', 'accept', runId]), 'run accept');

  // doctor は green（error なし）で exit 0。accept まで完走した DEMM 証跡
  //（verification / guard_results / evidence-hash）を新監査検査が false-positive なく通す。
  const doc = cli(root, ['doctor'], ['--json']);
  assert.equal(doc.status, 0, `doctor は green(exit0) であるべき: ${doc.stdout} ${doc.stderr}`);
  const docObj = parseSingleJson(doc.stdout, 'doctor --json');
  assert.equal(docObj.ok, true, `doctor.ok は true であるべき: ${JSON.stringify(docObj)}`);
});

// --- (v) run 系の --json 出力がパース可能な単一 JSON ---

test('(v) run 系サブコマンドの --json はすべてパース可能な単一 JSON である', () => {
  const root = tmpRoot('json');
  initProject(root, { adapter: 'none' });
  initSrcRepo(root);

  // open
  const open = parseSingleJson(
    assertOk(cli(root, ['run', 'open', '--adhoc', 'json 検査', '--check', OK_CHECK, '--surface', 'src/api/**']), 'open').stdout,
    'run open'
  );
  assert.equal(open.command, 'run open');
  assert.equal(open.ok, true);
  const runId = open.run;

  // handoff（handoff 本文を handoff キーに内包）
  const handoff = parseSingleJson(assertOk(cli(root, ['run', 'handoff', runId]), 'handoff').stdout, 'run handoff');
  assert.equal(handoff.command, 'run handoff');
  assert.equal(typeof handoff.handoff, 'string');
  assert.ok(handoff.handoff.length > 0);

  // return
  writeNotes(root, runId, '# notes\njson 検査 run。\n');
  const ret = parseSingleJson(assertOk(cli(root, ['run', 'return', runId]), 'return').stdout, 'run return');
  assert.equal(ret.command, 'run return');
  assert.equal(ret.to, 'returned');

  // verify
  const ver = parseSingleJson(assertOk(cli(root, ['run', 'verify', runId]), 'verify').stdout, 'run verify');
  assert.equal(ver.command, 'run verify');
  assert.equal(typeof ver.pass, 'boolean');
  assert.ok(Array.isArray(ver.checks));

  // accept
  const acc = parseSingleJson(assertOk(cli(root, ['run', 'accept', runId]), 'accept').stdout, 'run accept');
  assert.equal(acc.command, 'run accept');
  assert.equal(acc.to, 'accepted');

  // Refusal も単一 JSON（存在しない run の verify は exit 2 + {ok:false}）。
  const refused = cli(root, ['run', 'verify', 'r-nonexistent'], ['--json']);
  assert.notEqual(refused.status, 0, 'nonexistent run の verify は拒否されるべき');
  const refObj = parseSingleJson(refused.stdout, 'run verify refusal');
  assert.equal(refObj.ok, false);
  assert.equal(refObj.command, 'run verify');
});
