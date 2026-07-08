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
