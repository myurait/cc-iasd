import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { run } from '../lib/commands/run.js';
import { readAll, append } from '../lib/journal.js';
import { derive } from '../lib/state.js';
import { initProjectContext, baseCommit } from '../lib/gitops.js';
import {
  worktreeAdd,
  worktreeRemove,
  worktreeMerge,
  worktreeMergeDryRun,
  worktreeIsDirty,
  worktreeLock,
  worktreeUnlock,
  isAncestor,
  currentBranch,
} from '../lib/gitops.js';
import { write } from '../lib/writePath.js';
import { contentHash } from '../lib/hash.js';
import { Refusal } from '../lib/refuse.js';

// --- テストハーネス ---

// src 側 nested git repo を作り base.txt を 1 commit する。
function initSrcRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'base.txt'), 'a\nb\nc\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });
}

// project-context root を作り、src/<repo> を登録 config・worker role・journal を用意する。
function tmpRoot(repoName = 'api') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wt-'));
  initProjectContext(root);
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  const srcRepo = path.join(root, 'src', repoName);
  initSrcRepo(srcRepo);
  write(
    root,
    'cc-iasd.yaml',
    `doc_lang: Japanese\nrepos:\n  - name: ${repoName}\n    path: src/${repoName}\n`
  );
  write(root, path.join('roles', 'worker.md'), '# worker\nhandoff を入力に src/ のみ編集する。\n');
  return { root, srcRepo, repoName };
}

function snap(root) {
  return derive(readAll(root));
}

async function capture(fn) {
  const orig = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    const ret = await fn();
    return { out, ret };
  } finally {
    process.stdout.write = orig;
  }
}

// created event の data.worktree を引く。
function createdWorktree(root, runId) {
  const created = readAll(root).find(
    (e) => e.type === 'created' && e.subject === `run:${runId}`
  );
  return created && created.data && created.data.worktree;
}

// run gate の review record を notes.md の現 hash で記録する（accept 前提を満たす）。
function recordRunReview(root, runId) {
  const notes = fs.readFileSync(path.join(root, 'runs', runId, 'notes.md'), 'utf8');
  append(root, {
    type: 'review.recorded',
    subject: `run:${runId}`,
    actor: { kind: 'agent' },
    data: { gate: 'run' },
    payload: { path: `runs/${runId}/notes.md`, sha256: contentHash(notes) },
  });
}

// worktree-cleanup note（契約 2/3 章の後始末記録）を run 単位で引く。
function cleanupNotes(root, runId) {
  return readAll(root).filter(
    (e) =>
      e.type === 'note.appended' &&
      e.subject === `run:${runId}` &&
      e.data &&
      e.data.kind === 'worktree-cleanup'
  );
}

// =========================================================================
// gitops.js の worktree 4 関数（+ dry-run）の単体挙動
// =========================================================================

test('worktreeAdd は base から隔離ブランチを切り worktree を作る', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtadd-')) + '/wt';
  const res = worktreeAdd(srcRepo, wtPath, 'ccisad/r-x', base);
  assert.equal(res.branch, 'ccisad/r-x');
  assert.ok(fs.existsSync(path.join(wtPath, 'base.txt')));
  // worktree の HEAD は base ブランチと同一 commit を指す。
  assert.equal(baseCommit(wtPath), base);
});

test('worktreeMerge は非衝突ブランチを base へ merge し HEAD を返す', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const baseBranch = currentBranch(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtmerge-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-m', base);
  // worktree 側で新規ファイルを commit（base とは非衝突）。
  fs.writeFileSync(path.join(wtPath, 'feature.txt'), 'new\n');
  execFileSync('git', ['add', '-A'], { cwd: wtPath });
  execFileSync('git', ['commit', '-q', '-m', 'feat'], { cwd: wtPath });

  const res = worktreeMerge(srcRepo, baseBranch, 'ccisad/r-m');
  assert.equal(res.ok, true);
  assert.match(res.head, /^[0-9a-f]{40}$/);
  // base ブランチ本体に feature.txt が取り込まれている。
  assert.ok(fs.existsSync(path.join(srcRepo, 'feature.txt')));
});

test('worktreeMerge は衝突ブランチで ok:false + conflicts を返し merge を abort する', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const baseBranch = currentBranch(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtconf-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-c', base);
  // worktree 側で base.txt の中央行を書き換え commit。
  fs.writeFileSync(path.join(wtPath, 'base.txt'), 'a\nX\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'wt-edit'], { cwd: wtPath });
  // base ブランチ側でも同じ行を別内容へ書き換え commit（衝突を作る）。
  fs.writeFileSync(path.join(srcRepo, 'base.txt'), 'a\nY\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'base-edit'], { cwd: srcRepo });

  const res = worktreeMerge(srcRepo, baseBranch, 'ccisad/r-c');
  assert.equal(res.ok, false);
  assert.ok(res.conflicts.includes('base.txt'));
  // abort されているため base ブランチ working tree は元の base-edit のまま（merge 途中でない）。
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: srcRepo, encoding: 'utf8' });
  assert.equal(status.trim(), '');
});

test('worktreeMergeDryRun は衝突を実 merge せず検出する', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const baseBranch = currentBranch(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtdry-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-d', base);
  fs.writeFileSync(path.join(wtPath, 'base.txt'), 'a\nX\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'wt-edit'], { cwd: wtPath });
  fs.writeFileSync(path.join(srcRepo, 'base.txt'), 'a\nY\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'base-edit'], { cwd: srcRepo });

  const dry = worktreeMergeDryRun(srcRepo, baseBranch, 'ccisad/r-d');
  assert.equal(dry.ok, false);
  // dry-run は base ブランチ working tree を汚さない。
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: srcRepo, encoding: 'utf8' });
  assert.equal(status.trim(), '');
});

test('worktreeMergeDryRun は非衝突では ok:true', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const baseBranch = currentBranch(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtdry2-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-d2', base);
  fs.writeFileSync(path.join(wtPath, 'new.txt'), 'x\n');
  execFileSync('git', ['add', '-A'], { cwd: wtPath });
  execFileSync('git', ['commit', '-q', '-m', 'wt-new'], { cwd: wtPath });

  const dry = worktreeMergeDryRun(srcRepo, baseBranch, 'ccisad/r-d2');
  assert.equal(dry.ok, true);
});

test('worktreeRemove は worktree を剥がす（存在しなくても無害）', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtrm-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-rm', base);
  assert.ok(fs.existsSync(wtPath));
  worktreeRemove(srcRepo, wtPath);
  assert.ok(!fs.existsSync(path.join(wtPath, 'base.txt')));
  // 二重削除しても例外を投げない。
  worktreeRemove(srcRepo, wtPath);
});

// =========================================================================
// run open --isolate: worktree を張り created.data.worktree に焼く
// =========================================================================

test('run open --isolate は repo ごとに worktree を作り created.data.worktree へ記録する', async () => {
  const { root, srcRepo, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'worktree run', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wt = createdWorktree(root, runId);
  assert.ok(wt, 'created.data.worktree が焼かれている');
  assert.ok(wt[repoName], `repo ${repoName} の worktree 記述がある`);
  assert.equal(wt[repoName].branch, `ccisad/${runId}`);
  assert.equal(wt[repoName].base, baseCommit(srcRepo));
  // worktree 実体が out/<run-id>/wt/<repo> に存在する。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'wt', repoName, 'base.txt')));
});

test('run open（--isolate なし）は worktree を作らない（後方互換）', async () => {
  const { root, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'plain run', check: 'node -e "process.exit(0)"' },
      root,
    })
  );
  const runId = opened.ret;
  assert.equal(createdWorktree(root, runId), undefined);
  assert.ok(!fs.existsSync(path.join(root, 'out', runId, 'wt', repoName)));
});

test('spike run は --isolate 指定でも worktree を作らない（src 不変）', async () => {
  const { root } = tmpRoot();
  const opened = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: 'spike', spike: true, isolate: true }, root })
  );
  const runId = opened.ret;
  assert.equal(createdWorktree(root, runId), undefined);
});

// =========================================================================
// worktree run の e2e: worktree 内で実装 -> return diff -> verify -> accept merge
// =========================================================================

test('worktree run e2e: 隔離内で実装し return/verify が worktree を見る -> accept で merge・掃除', async () => {
  const { root, srcRepo, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: ' isolate e2e', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wt = createdWorktree(root, runId);
  const wtPath = wt[repoName].path;
  const baseBranch = wt[repoName].baseBranch;

  // worker は worktree 内で実装する（base repo 本体は触らない）。
  fs.writeFileSync(path.join(wtPath, 'impl.txt'), 'implemented\n');
  execFileSync('git', ['add', '-A'], { cwd: wtPath });
  execFileSync('git', ['commit', '-q', '-m', 'impl'], { cwd: wtPath });

  // notes を書いて return。
  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\nworktree 内で実装した。\n');
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));

  // return の diff-snapshot は worktree の変更（impl.txt）を捉える。
  const noteEv = readAll(root).find(
    (e) => e.type === 'note.appended' && e.subject === `run:${runId}`
  );
  assert.ok(noteEv, 'diff-snapshot note が記録される');
  const changed = noteEv.data.repos[repoName].changed;
  assert.ok(changed.includes('impl.txt'), 'worktree の変更が diff に出る');

  // verify（check pass・conflict なし）-> pass。
  const vp = await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  assert.equal(vp.ret.pass, true);
  assert.equal(vp.ret.mergeConflicts, undefined);

  // gate=run review を notes hash で記録。
  const notes = fs.readFileSync(path.join(root, 'runs', runId, 'notes.md'), 'utf8');
  append(root, {
    type: 'review.recorded',
    subject: `run:${runId}`,
    actor: { kind: 'agent' },
    data: { gate: 'run' },
    payload: { path: `runs/${runId}/notes.md`, sha256: contentHash(notes) },
  });

  // accept -> merge が走り base ブランチに impl.txt が取り込まれ、worktree は掃除される。
  const acc = await capture(() => run({ positional: ['accept', runId], flags: {}, root }));
  assert.equal(acc.ret, runId);
  assert.equal(snap(root).runs[runId].status, 'accepted');
  assert.ok(fs.existsSync(path.join(srcRepo, 'impl.txt')), 'base ブランチに merge された');
  assert.ok(!fs.existsSync(path.join(wtPath, 'base.txt')), 'worktree が掃除された');
  // commit.observed が merge 後 HEAD を焼く。
  const obs = readAll(root).find(
    (e) => e.type === 'commit.observed' && e.subject === `run:${runId}`
  );
  assert.ok(obs && obs.data.repos[repoName], 'merge 後 HEAD が commit.observed に記録される');
  // base ブランチ HEAD が記録値と一致。
  assert.equal(baseCommit(srcRepo), obs.data.repos[repoName]);
  void baseBranch;
});

// =========================================================================
// conflict は verify 段で機械検出され accept を封鎖する（canon 09 4.3）
// =========================================================================

test('worktree run: base が進み conflict する場合 verify が fail し accept が封鎖される', async () => {
  const { root, srcRepo, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'conflict run', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wt = createdWorktree(root, runId);
  const wtPath = wt[repoName].path;

  // worktree 側で base.txt の中央行を書き換え commit。
  fs.writeFileSync(path.join(wtPath, 'base.txt'), 'a\nWT\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'wt-edit'], { cwd: wtPath });
  // base ブランチ本体でも同じ行を別内容へ commit（後から base が進み衝突）。
  fs.writeFileSync(path.join(srcRepo, 'base.txt'), 'a\nMAIN\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'base-advanced'], { cwd: srcRepo });

  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\n衝突する実装。\n');
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));

  // verify: check は pass だが merge dry-run が conflict -> verdict.pass=false。
  const vp = await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  assert.equal(vp.ret.pass, false, 'conflict で verify fail');
  assert.ok(vp.ret.mergeConflicts, 'mergeConflicts が verdict に載る');
  assert.equal(vp.ret.mergeConflicts[0].repo, repoName);
  assert.equal(snap(root).verifications[runId].pass, false);

  // gate=run review を記録しても、verification fail のため accept は封鎖される。
  const notes = fs.readFileSync(path.join(root, 'runs', runId, 'notes.md'), 'utf8');
  append(root, {
    type: 'review.recorded',
    subject: `run:${runId}`,
    actor: { kind: 'agent' },
    data: { gate: 'run' },
    payload: { path: `runs/${runId}/notes.md`, sha256: contentHash(notes) },
  });
  await assert.rejects(
    () => capture(() => run({ positional: ['accept', runId], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'verification'));
      return true;
    }
  );
  // accept は成立していないため base ブランチは merge されていない（base-advanced のまま）。
  assert.equal(
    fs.readFileSync(path.join(srcRepo, 'base.txt'), 'utf8'),
    'a\nMAIN\nc\n'
  );
});

// =========================================================================
// 束1 契約 1: worktreeRemove の force 引数化・戻り値・dirty 検出
// =========================================================================

test('worktreeRemove は既定 force=false で dirty worktree を残置し {removed:false,dirty:true} を返す', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtdirty-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-dirty', base);
  // worktree を dirty にする（tracked ファイルを書き換え未 commit）。
  fs.writeFileSync(path.join(wtPath, 'base.txt'), 'a\nDIRTY\nc\n');
  assert.equal(worktreeIsDirty(wtPath), true);

  const res = worktreeRemove(srcRepo, wtPath); // 既定 force=false
  assert.equal(res.removed, false);
  assert.equal(res.dirty, true);
  assert.ok(fs.existsSync(path.join(wtPath, 'base.txt')), '残置される');

  // force=true なら強制削除できる。
  const res2 = worktreeRemove(srcRepo, wtPath, { force: true });
  assert.equal(res2.removed, true);
  assert.ok(!fs.existsSync(path.join(wtPath, 'base.txt')));
});

test('worktreeRemove は clean worktree を force=false で剥がし {removed:true} を返す', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtclean-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-clean', base);
  const res = worktreeRemove(srcRepo, wtPath);
  assert.equal(res.removed, true);
  // 既に無い path への再削除は removed:false・例外なし。
  const res2 = worktreeRemove(srcRepo, wtPath);
  assert.equal(res2.removed, false);
});

test('isAncestor は git merge-base --is-ancestor を exit で判定する', () => {
  const { srcRepo } = tmpRoot();
  const c1 = baseCommit(srcRepo);
  assert.equal(isAncestor(srcRepo, c1, c1), true); // 自分自身は祖先
  fs.writeFileSync(path.join(srcRepo, 'x.txt'), 'x\n');
  execFileSync('git', ['add', '-A'], { cwd: srcRepo });
  execFileSync('git', ['commit', '-q', '-m', 'c2'], { cwd: srcRepo });
  const c2 = baseCommit(srcRepo);
  assert.equal(isAncestor(srcRepo, c1, c2), true); // c1 は c2 の祖先
  assert.equal(isAncestor(srcRepo, c2, c1), false); // 逆は偽
});

// =========================================================================
// 束1 契約 4: lock 中は force なし remove が拒否され、unlock で剥がせる
// =========================================================================

test('worktreeLock 中は force=false remove が拒否され、unlock 後に剥がせる', () => {
  const { srcRepo } = tmpRoot();
  const base = baseCommit(srcRepo);
  const wtPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wtlock-')) + '/wt';
  worktreeAdd(srcRepo, wtPath, 'ccisad/r-lock', base);
  worktreeLock(srcRepo, wtPath, 'active run test');

  // lock 済み clean worktree は force=false では削除できない（dirty ではなく lock 起因）。
  const res = worktreeRemove(srcRepo, wtPath);
  assert.equal(res.removed, false);
  assert.equal(res.dirty, false);
  assert.ok(fs.existsSync(path.join(wtPath, 'base.txt')));

  // unlock すれば force=false で剥がせる。
  worktreeUnlock(srcRepo, wtPath);
  const res2 = worktreeRemove(srcRepo, wtPath);
  assert.equal(res2.removed, true);
});

// =========================================================================
// 束1 契約 7: 非 worktree run の base 進行検査（accept ガード）
// =========================================================================

test('非 worktree run: 記録 base が現 HEAD の祖先でないと accept が base-progress で封鎖される', async () => {
  const { root, srcRepo } = tmpRoot();
  // 非 isolate の adhoc run（worktree なし）。repos に base が記録される。
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'base progress', check: 'node -e "process.exit(0)"' },
      root,
    })
  );
  const runId = opened.ret;
  assert.equal(createdWorktree(root, runId), undefined, '非 worktree run');

  write(root, path.join('runs', runId, 'notes.md'), '## メモ\n非 worktree run。\n');
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));
  const vp = await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  assert.equal(vp.ret.pass, true);
  recordRunReview(root, runId);

  // verify 後に base repo の履歴を amend で置換 -> 記録 base は現 HEAD の祖先でなくなる。
  fs.writeFileSync(path.join(srcRepo, 'base.txt'), 'amended\n');
  execFileSync('git', ['commit', '-q', '--amend', '-am', 'amended'], { cwd: srcRepo });

  await assert.rejects(
    () => capture(() => run({ positional: ['accept', runId], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'base-progress'), 'base-progress で封鎖');
      return true;
    }
  );
});

test('非 worktree run: base が動かなければ base-progress は pass し accept できる', async () => {
  const { root } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'base stable', check: 'node -e "process.exit(0)"' },
      root,
    })
  );
  const runId = opened.ret;
  write(root, path.join('runs', runId, 'notes.md'), '## メモ\nbase 不動。\n');
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));
  await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  recordRunReview(root, runId);
  const acc = await capture(() => run({ positional: ['accept', runId], flags: {}, root }));
  assert.equal(acc.ret, runId);
  assert.equal(snap(root).runs[runId].status, 'accepted');
});

// =========================================================================
// 束1 契約 6: accept 直前の再 merge dry-run（verify 後に base が進んだ窓の封鎖）
// =========================================================================

test('worktree run: verify は pass するが accept 直前に base が進み conflict する場合、再 dry-run が accept の merge を封鎖する', async () => {
  const { root, srcRepo, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'redry', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wt = createdWorktree(root, runId);
  const wtPath = wt[repoName].path;

  // worktree 側で base.txt を編集 commit（この時点では base 本体は不動なので dry-run は clean）。
  fs.writeFileSync(path.join(wtPath, 'base.txt'), 'a\nWT\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'wt-edit'], { cwd: wtPath });

  write(root, path.join('runs', runId, 'notes.md'), '## メモ\n後から衝突する実装。\n');
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));
  const vp = await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  assert.equal(vp.ret.pass, true, 'verify 時点では conflict なし -> pass');
  recordRunReview(root, runId);

  // verify 後に base 本体が同じ行を別内容へ進む（競合窓）。
  fs.writeFileSync(path.join(srcRepo, 'base.txt'), 'a\nMAIN\nc\n');
  execFileSync('git', ['commit', '-q', '-am', 'base-advanced'], { cwd: srcRepo });

  await assert.rejects(
    () => capture(() => run({ positional: ['accept', runId], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'worktree-merge'), '再 dry-run で merge 封鎖');
      return true;
    }
  );
  // merge は実施されていない（base 本体は base-advanced のまま）。
  assert.equal(fs.readFileSync(path.join(srcRepo, 'base.txt'), 'utf8'), 'a\nMAIN\nc\n');
  assert.ok(fs.existsSync(path.join(wtPath, 'base.txt')), 'worktree は残置される');
});

// =========================================================================
// 束1 契約 2: block / escalate の終端後始末（clean は掃除・未 merge 成果は残置）
// =========================================================================

test('run block: 成果なし clean worktree は掃除され worktree-cleanup=removed が記録される', async () => {
  const { root, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'block clean', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wtPath = createdWorktree(root, runId)[repoName].path;
  assert.ok(fs.existsSync(path.join(wtPath, 'base.txt')));

  await capture(() =>
    run({ positional: ['block', runId], flags: { missing: 'spec:s001' }, root })
  );
  assert.equal(snap(root).runs[runId].status, 'blocked');
  const notes = cleanupNotes(root, runId);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].data.action, 'removed');
  assert.ok(!fs.existsSync(path.join(wtPath, 'base.txt')), 'worktree が掃除された');
});

test('run escalate: 未 merge 成果ありの worktree は残置され worktree-cleanup=kept(unmerged-commits) が記録される', async () => {
  const { root, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'esc unmerged', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wtPath = createdWorktree(root, runId)[repoName].path;
  // worktree 側に成果 commit（base 未反映）。
  fs.writeFileSync(path.join(wtPath, 'impl.txt'), 'work\n');
  execFileSync('git', ['add', '-A'], { cwd: wtPath });
  execFileSync('git', ['commit', '-q', '-m', 'impl'], { cwd: wtPath });

  await capture(() => run({ positional: ['escalate', runId], flags: {}, root }));
  assert.equal(snap(root).runs[runId].status, 'escalated');
  const notes = cleanupNotes(root, runId);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].data.action, 'kept');
  assert.equal(notes[0].data.reason, 'unmerged-commits');
  assert.ok(fs.existsSync(path.join(wtPath, 'impl.txt')), '成果が残置される');
});

test('cleanup=keep なら終端で worktree を全残置し reason=config-keep を記録する', async () => {
  const { root, repoName } = tmpRoot();
  // cleanup=keep に上書き。
  write(
    root,
    'cc-iasd.yaml',
    `doc_lang: Japanese\nrepos:\n  - name: ${repoName}\n    path: src/${repoName}\nworktree:\n  cleanup: keep\n`
  );
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'keep mode', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wtPath = createdWorktree(root, runId)[repoName].path;
  await capture(() =>
    run({ positional: ['block', runId], flags: { missing: 'spec:s001' }, root })
  );
  const notes = cleanupNotes(root, runId);
  assert.equal(notes[0].data.action, 'kept');
  assert.equal(notes[0].data.reason, 'config-keep');
  assert.ok(fs.existsSync(path.join(wtPath, 'base.txt')), 'keep で残置');
});

// =========================================================================
// 束1 契約 3: run cleanup（--stale の is-ancestor 回収 / <run-id> の force）
// =========================================================================

test('run cleanup --stale: base 取込済み（is-ancestor）かつ stale な worktree を回収する', async () => {
  const { root, srcRepo, repoName } = tmpRoot();
  // cleanup=keep で accept 後も worktree を残す -> --stale の回収対象にする。
  write(
    root,
    'cc-iasd.yaml',
    `doc_lang: Japanese\nrepos:\n  - name: ${repoName}\n    path: src/${repoName}\nworktree:\n  cleanup: keep\n`
  );
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'stale merged', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wtPath = createdWorktree(root, runId)[repoName].path;
  fs.writeFileSync(path.join(wtPath, 'impl.txt'), 'done\n');
  execFileSync('git', ['add', '-A'], { cwd: wtPath });
  execFileSync('git', ['commit', '-q', '-m', 'impl'], { cwd: wtPath });

  write(root, path.join('runs', runId, 'notes.md'), '## メモ\nmerge 済みにする。\n');
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));
  await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  recordRunReview(root, runId);
  await capture(() => run({ positional: ['accept', runId], flags: {}, root }));
  // accept で base へ merge 済み。cleanup=keep なので worktree は残っている。
  assert.ok(fs.existsSync(path.join(wtPath, 'impl.txt')), 'accept 後も keep で残置');
  assert.ok(fs.existsSync(path.join(srcRepo, 'impl.txt')), 'base に merge 済み');

  // --days 0 で全 run を stale とみなす。branch 先端は merge により HEAD の祖先。
  const res = await capture(() =>
    run({ positional: ['cleanup'], flags: { stale: true, days: '0' }, root })
  );
  assert.ok(res.ret.removed.some((r) => r.run === runId && r.repo === repoName), '回収された');
  assert.ok(!fs.existsSync(path.join(wtPath, 'impl.txt')), 'worktree が剥がれた');
});

test('run cleanup --stale: 未 merge（is-ancestor でない）worktree は回収せず kept(unmerged-commits)', async () => {
  const { root, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'stale unmerged', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wtPath = createdWorktree(root, runId)[repoName].path;
  // 成果 commit（base 未反映） -> branch 先端は HEAD の祖先ではない。
  fs.writeFileSync(path.join(wtPath, 'impl.txt'), 'wip\n');
  execFileSync('git', ['add', '-A'], { cwd: wtPath });
  execFileSync('git', ['commit', '-q', '-m', 'wip'], { cwd: wtPath });

  const res = await capture(() =>
    run({ positional: ['cleanup'], flags: { stale: true, days: '0' }, root })
  );
  assert.equal(res.ret.removed.length, 0);
  assert.ok(
    res.ret.kept.some((k) => k.run === runId && k.reason === 'unmerged-commits'),
    '未 merge は残置'
  );
  assert.ok(fs.existsSync(path.join(wtPath, 'impl.txt')));
});

test('run cleanup <run-id>: dirty worktree は force なしで残置、--force で回収する', async () => {
  const { root, repoName } = tmpRoot();
  const opened = await capture(() =>
    run({
      positional: ['open'],
      flags: { adhoc: 'cleanup force', check: 'node -e "process.exit(0)"', isolate: true },
      root,
    })
  );
  const runId = opened.ret;
  const wtPath = createdWorktree(root, runId)[repoName].path;
  // worktree を dirty にする（未 commit）。
  fs.writeFileSync(path.join(wtPath, 'base.txt'), 'a\nDIRTY\nc\n');

  // force なし -> dirty で残置。
  const res1 = await capture(() =>
    run({ positional: ['cleanup', runId], flags: {}, root })
  );
  assert.ok(res1.ret.kept.some((k) => k.reason === 'dirty'));
  assert.ok(fs.existsSync(path.join(wtPath, 'base.txt')), 'dirty は残置');

  // --force -> 強制回収。
  const res2 = await capture(() =>
    run({ positional: ['cleanup', runId], flags: { force: true }, root })
  );
  assert.ok(res2.ret.removed.some((r) => r.repo === repoName));
  assert.ok(!fs.existsSync(path.join(wtPath, 'base.txt')), 'force で回収');
});

test('run cleanup は <run-id> も --stale も無い場合 refuse する', async () => {
  const { root } = tmpRoot();
  await assert.rejects(
    () => capture(() => run({ positional: ['cleanup'], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'mode'));
      return true;
    }
  );
});
