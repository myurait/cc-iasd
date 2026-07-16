import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 統合 e2e（実 CLI）。worktree 強化 / resume キャッシュ / verify 型付けの 3 系統統合が
// 同一 CLI 経路で結線して動くことを実機で検証する:
//   (i)   block 終端後に clean worktree は自動掃除され、dirty worktree は残置される
//   (ii)  run cleanup --stale は merge 済み worktree のみ回収し、未 merge は残置する
//   (iii) 非 worktree run で base が分岐した状態の accept が base-progress で封鎖される
//   (iv)  resume 2 回目（入力不変）で bundle 再利用が journal に記録される
//   (v)   verify の実行不能が unverified 型で記録され、accept が verification 理由型で封鎖される
//
// 設計正本: 03 3.6・7.3（worktree 物理配置・config・終端後始末）/ 05 7 章（force 既定・終端統一・
// base-progress・再 merge dry-run）/ 05 10 章（session lifecycle・resume compile-cache）/
// 06 3.2（session/verify event data）/ 06 4.1（verdict 理由型）/ 08 3.8・3.13・3.20（run open
// --worktree / accept 理由型 / run cleanup）。すべて一時 project-context を --root にして実行し
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

// 拒否（exit 2 + {ok:false}）を検証してパースする。
function parseRefusal(r, label) {
  assert.notEqual(r.status, 0, `${label} は拒否（非 0 exit）であるべき: stdout=${r.stdout} stderr=${r.stderr}`);
  const obj = parseSingleJson(r.stdout, `${label} refusal`);
  assert.equal(obj.ok, false, `${label} refusal は ok:false であるべき: ${JSON.stringify(obj)}`);
  return obj;
}

function tmpRoot(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cc-e2eadopt-${tag}-`));
}

function readJournal(root) {
  const dir = path.join(root, 'journal');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

// worktree-cleanup note（note.appended {kind:'worktree-cleanup'}）を run/repo で引く。
function cleanupNotes(root, runId, repo) {
  return readJournal(root).filter(
    (e) =>
      e.type === 'note.appended' &&
      e.subject === `run:${runId}` &&
      e.data &&
      e.data.kind === 'worktree-cleanup' &&
      (repo == null || e.data.repo === repo)
  );
}

// require_tty=false / gates.run=none / 指定 repos 登録で init する。
function initProject(root, { adapter = 'none', repos = [] } = {}) {
  assertOk(cli(root, ['init'], ['--json']), 'init');
  const repoLines = repos.map((r) => `  - { name: ${r.name}, path: ${r.path} }`);
  fs.writeFileSync(
    path.join(root, 'cc-iasd.yaml'),
    [
      'doc_lang: Japanese',
      'dev_lang: TypeScript',
      repos.length ? 'repos:' : 'repos: []',
      ...repoLines,
      'checks_allowlist: ["npm ", "npx ", "node ", "git "]',
      // 本 e2e の焦点は worktree / cache / verify 型付けであり run gate の chain 検証は範囲外。
      'gates: { spec: required, run: none }',
      `runtime: { adapter: ${adapter} }`,
      'decision: { require_tty: false, allow_adopt: false }',
      '',
    ].join('\n')
  );
}

// src/<name> を nested git repo として base 1 commit で初期化する。
function initRepo(root, name) {
  const repoPath = path.join(root, 'src', name);
  fs.mkdirSync(repoPath, { recursive: true });
  gitIn(repoPath, ['init', '-q']);
  gitIn(repoPath, ['config', 'user.name', 'test']);
  gitIn(repoPath, ['config', 'user.email', 'test@example.com']);
  gitIn(repoPath, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoPath, 'base.txt'), 'a\nb\nc\n');
  gitIn(repoPath, ['add', '-A']);
  gitIn(repoPath, ['commit', '-q', '-m', 'base']);
  return repoPath;
}

function gitIn(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// worktree 内で 1 ファイルを追加し commit する（隔離ブランチ側の作業を模す）。
function implementInWorktree(wtPath, relFile, content) {
  const abs = path.join(wtPath, relFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  gitIn(wtPath, ['add', '-A']);
  gitIn(wtPath, ['commit', '-q', '-m', 'impl']);
}

function writeNotes(root, runId, body) {
  const p = path.join(root, 'runs', runId, 'notes.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}

// created.data.worktree を journal から取り出す。
function worktreeOf(root, runId) {
  const created = readJournal(root).find(
    (e) => e.type === 'created' && e.subject === `run:${runId}`
  );
  return created && created.data && created.data.worktree ? created.data.worktree : null;
}

function absWt(root, wtEntry) {
  return path.isAbsolute(wtEntry.path) ? wtEntry.path : path.join(root, wtEntry.path);
}

// --- (i) block 終端後: clean worktree 自動掃除 / dirty worktree 残置 ---

test('(i) block 終端: clean worktree は自動掃除され dirty worktree は残置される', () => {
  // clean ケース（別 root）。
  const rootClean = tmpRoot('block-clean');
  initProject(rootClean, { repos: [{ name: 'api', path: 'src/api' }] });
  initRepo(rootClean, 'api');
  const cleanRun = parseSingleJson(
    assertOk(
      cli(rootClean, ['run', 'open', '--adhoc', '掃除される隔離', '--check', OK_CHECK, '--surface', 'src/api/**', '--isolate']),
      'run open clean'
    ).stdout,
    'run open clean'
  ).run;
  const cleanWt = worktreeOf(rootClean, cleanRun);
  assert.ok(cleanWt && cleanWt.api, 'clean run に worktree が張られるべき');
  const cleanWtAbs = absWt(rootClean, cleanWt.api);
  assert.ok(fs.existsSync(cleanWtAbs), 'block 前は worktree 実体が在るべき');

  // 何も実装せず block（clean かつ成果差分なし）。
  assertOk(cli(rootClean, ['run', 'block', cleanRun, '--missing', 'spec:upstream']), 'run block clean');

  // clean worktree は自動削除され、note.appended {kind:worktree-cleanup, action:removed} が刻まれる。
  assert.ok(!fs.existsSync(cleanWtAbs), 'block 後に clean worktree は掃除されるべき');
  const removedNotes = cleanupNotes(rootClean, cleanRun, 'api');
  assert.equal(removedNotes.length, 1, 'worktree-cleanup note が 1 件刻まれるべき');
  assert.equal(removedNotes[0].data.action, 'removed', 'clean worktree は action=removed であるべき');

  // dirty ケース（別 root）。
  const rootDirty = tmpRoot('block-dirty');
  initProject(rootDirty, { repos: [{ name: 'api', path: 'src/api' }] });
  initRepo(rootDirty, 'api');
  const dirtyRun = parseSingleJson(
    assertOk(
      cli(rootDirty, ['run', 'open', '--adhoc', '残置される隔離', '--check', OK_CHECK, '--surface', 'src/api/**', '--isolate']),
      'run open dirty'
    ).stdout,
    'run open dirty'
  ).run;
  const dirtyWt = worktreeOf(rootDirty, dirtyRun);
  const dirtyWtAbs = absWt(rootDirty, dirtyWt.api);
  // worktree に未 commit ファイルを置いて dirty にする。
  fs.writeFileSync(path.join(dirtyWtAbs, 'uncommitted.txt'), 'x\n');

  assertOk(cli(rootDirty, ['run', 'block', dirtyRun, '--missing', 'spec:upstream']), 'run block dirty');

  // dirty worktree は残置され、reason=dirty が記録される。
  assert.ok(fs.existsSync(dirtyWtAbs), 'block 後も dirty worktree は残置されるべき');
  const keptNotes = cleanupNotes(rootDirty, dirtyRun, 'api');
  assert.equal(keptNotes.length, 1, 'worktree-cleanup note が 1 件刻まれるべき');
  assert.equal(keptNotes[0].data.action, 'kept', 'dirty worktree は action=kept であるべき');
  assert.equal(keptNotes[0].data.reason, 'dirty', 'dirty worktree の reason は dirty であるべき');
});

// --- (ii) run cleanup --stale が merge 済み worktree のみ回収する ---

test('(ii) run cleanup --stale は merge 済み worktree のみ回収し未 merge は残置する', () => {
  const root = tmpRoot('stale');
  initProject(root, {
    repos: [
      { name: 'api', path: 'src/api' },
      { name: 'web', path: 'src/web' },
    ],
  });
  initRepo(root, 'api');
  initRepo(root, 'web');

  // src/** で両 repo を隔離対象にする（reposFromSurfaces が repo を取れず全 repo 隔離）。
  const runId = parseSingleJson(
    assertOk(
      cli(root, ['run', 'open', '--adhoc', 'stale 検査', '--check', OK_CHECK, '--surface', 'src/**', '--isolate']),
      'run open --isolate'
    ).stdout,
    'run open'
  ).run;
  const wt = worktreeOf(root, runId);
  assert.ok(wt && wt.api && wt.web, 'api / web 両方の worktree が張られるべき');

  // 両 worktree で 1 commit（隔離ブランチを base より進める）。
  implementInWorktree(absWt(root, wt.api), 'a.txt', 'api\n');
  implementInWorktree(absWt(root, wt.web), 'w.txt', 'web\n');

  // api の隔離ブランチだけを base へ手動 merge する（api は「取込済み」、web は「未 merge」）。
  gitIn(path.join(root, 'src', 'api'), ['merge', '--no-ff', '--no-edit', wt.api.branch]);

  // run cleanup --stale --days 0（全 run が stale。回収可否は is-ancestor で決まる）。
  const res = parseSingleJson(
    assertOk(cli(root, ['run', 'cleanup'], ['--stale', '--days', '0', '--json']), 'run cleanup --stale').stdout,
    'run cleanup --stale'
  );
  assert.equal(res.command, 'run cleanup');

  // api（merge 済み）は removed、web（未 merge）は kept(unmerged-commits)。
  const removedRepos = res.removed.map((x) => x.repo).sort();
  const keptWeb = res.kept.find((x) => x.repo === 'web');
  assert.deepEqual(removedRepos, ['api'], `merge 済み api のみ回収されるべき: ${JSON.stringify(res)}`);
  assert.ok(keptWeb, 'web は残置されるべき');
  assert.equal(keptWeb.reason, 'unmerged-commits', '未 merge の web は unmerged-commits で残置されるべき');

  // 実体: api worktree は消え、web worktree は残る。
  assert.ok(!fs.existsSync(absWt(root, wt.api)), 'api worktree 実体は掃除されるべき');
  assert.ok(fs.existsSync(absWt(root, wt.web)), 'web worktree 実体は残置されるべき');
});

// --- (iii) 非 worktree run で base が分岐した状態の accept が封鎖される ---

test('(iii) 非 worktree run: base が分岐すると accept が base-progress で封鎖される', () => {
  const root = tmpRoot('baseprog');
  initProject(root, { repos: [{ name: 'api', path: 'src/api' }] });
  const repoPath = initRepo(root, 'api');

  // 非 worktree（--isolate なし）で open。base = api の現 HEAD（root commit）を記録する。
  const runId = parseSingleJson(
    assertOk(
      cli(root, ['run', 'open', '--adhoc', 'base 分岐検査', '--check', OK_CHECK, '--surface', 'src/api/**']),
      'run open'
    ).stdout,
    'run open'
  ).run;
  assert.equal(worktreeOf(root, runId), null, '非 worktree run は worktree を張らないべき');

  writeNotes(root, runId, '# notes\nbase 分岐検査 run。\n');
  assertOk(cli(root, ['run', 'return', runId]), 'run return');
  const v = parseSingleJson(assertOk(cli(root, ['run', 'verify', runId]), 'run verify').stdout, 'verify');
  assert.equal(v.pass, true, 'verify は pass すべき（OK check・diff 空）');

  // 記録 base（root commit）を rewrite して分岐させる（amend で SHA を変える）。
  gitIn(repoPath, ['commit', '--amend', '-m', 'amended-root', '--allow-empty']);

  // accept は base-progress ガードで封鎖される（記録 base が現 HEAD の非祖先）。
  const refused = parseRefusal(cli(root, ['run', 'accept', runId]), 'run accept');
  assert.match(refused.command, /^run accept/, 'refusal は run accept 由来であるべき');
  const bp = refused.missing.find((m) => m.input === 'base-progress');
  assert.ok(bp, `base-progress で封鎖されるべき: ${JSON.stringify(refused.missing)}`);
  assert.match(bp.detail, /祖先でない|巻き戻り|分岐/, 'base 分岐の detail を露出すべき');

  // 封鎖されたので run は verified のまま（accepted にならない）。
  const st = readJournal(root).filter(
    (e) => e.type === 'transitioned' && e.subject === `run:${runId}` && e.data.to === 'accepted'
  );
  assert.equal(st.length, 0, 'accept は成立しないべき（accepted 遷移なし）');
});

// --- (iv) resume 2 回目（入力不変）で bundle 再利用が journal に記録される ---

test('(iv) resume: 入力不変の 2 回目で compile-cache 再利用が journal に記録される', () => {
  const root = tmpRoot('resume');
  initProject(root, { adapter: 'none' }); // repo 登録なし（reposBase 安定）
  const runId = parseSingleJson(
    assertOk(cli(root, ['run', 'open', '--adhoc', 'resume 検査', '--check', OK_CHECK]), 'run open').stdout,
    'run open'
  ).run;

  // start -> bundle.md 生成 + session.started（inputHashes 記録）。
  assertOk(cli(root, ['session', 'start', runId]), 'session start');
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'bundle.md')), 'bundle.md が生成されるべき');

  // resume 1 回目: 直近 resumed が無い（prev=null）ため必ず再 compile（cache hit なし）。
  assertOk(cli(root, ['session', 'resume', runId]), 'session resume 1');
  // resume 2 回目: 入力不変で bundle 再利用（compile-cache hit）。
  assertOk(cli(root, ['session', 'resume', runId]), 'session resume 2');

  const resumed = readJournal(root)
    .filter((e) => e.type === 'session.resumed' && e.subject === `run:${runId}`)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  assert.equal(resumed.length, 2, 'session.resumed が 2 件あるべき');
  // 1 回目は再 compile（compileReused=false）。
  assert.equal(resumed[0].data.compileReused, false, '初回 resume は再 compile であるべき');
  // 2 回目は再利用（compileReused=true・changedInputs=[]）。
  assert.equal(resumed[1].data.compileReused, true, '2 回目 resume は bundle 再利用であるべき');
  assert.deepEqual(resumed[1].data.changedInputs, [], '入力不変なら changedInputs は空であるべき');

  // compile-cache note が刻まれる（2 回目のみ hit）。
  const cacheNotes = readJournal(root).filter(
    (e) =>
      e.type === 'note.appended' &&
      e.subject === `run:${runId}` &&
      e.data &&
      e.data.kind === 'compile-cache'
  );
  assert.equal(cacheNotes.length, 1, 'compile-cache note は 2 回目のみ 1 件刻まれるべき');
  assert.equal(cacheNotes[0].data.hit, true, 'compile-cache は hit=true であるべき');
});

// --- (v) verify の実行不能が unverified 型で記録され accept が封鎖される ---

test('(v) verify 実行不能は unverified 型で記録され accept が理由型付きで封鎖される', () => {
  const root = tmpRoot('unverified');
  initProject(root, { adapter: 'none' });

  // spawn できない存在しないコマンドを check にする（ENOENT -> unverified）。
  const runId = parseSingleJson(
    assertOk(
      cli(root, ['run', 'open', '--adhoc', '実行不能 check', '--check', 'cc-iasd-nonexistent-binary-xyz']),
      'run open'
    ).stdout,
    'run open'
  ).run;

  writeNotes(root, runId, '# notes\n実行不能 check の run。\n');
  assertOk(cli(root, ['run', 'return', runId]), 'run return');

  // verify: 実行不能 -> pass=false・failureReasons=[unverified]・checks[].reason=unverified。
  const v = parseSingleJson(assertOk(cli(root, ['run', 'verify', runId]), 'run verify').stdout, 'verify');
  assert.equal(v.pass, false, 'verify は fail であるべき');
  assert.deepEqual(v.failureReasons, ['unverified'], 'failureReasons は unverified であるべき');
  assert.ok(Array.isArray(v.checks) && v.checks.length === 1, 'check は 1 件であるべき');
  assert.equal(v.checks[0].reason, 'unverified', 'check の reason は unverified であるべき');

  // verify.recorded event にも理由型が焼かれる。
  const rec = readJournal(root)
    .filter((e) => e.type === 'verify.recorded' && e.subject === `run:${runId}`)
    .pop();
  assert.ok(rec, 'verify.recorded が刻まれるべき');
  assert.deepEqual(rec.data.failureReasons, ['unverified'], 'verify.recorded.failureReasons=unverified');
  assert.equal(rec.data.checks[0].reason, 'unverified', 'verify.recorded.checks[].reason=unverified');

  // accept: verification pass=false で封鎖され、detail に理由型（unverified）が露出する。
  const refused = parseRefusal(cli(root, ['run', 'accept', runId]), 'run accept');
  const vg = refused.missing.find((m) => m.input === 'verification');
  assert.ok(vg, `verification で封鎖されるべき: ${JSON.stringify(refused.missing)}`);
  assert.match(vg.detail, /unverified/, 'accept 拒否 detail に理由型 unverified を露出すべき');
});
