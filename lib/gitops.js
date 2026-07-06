import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// git を同期実行し stdout を返す。失敗時は例外に stderr を載せる。
function git(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const stderr = e.stderr ? String(e.stderr) : '';
    const err = new Error(`git ${args.join(' ')} 失敗: ${stderr || e.message}`);
    err.cause = e;
    err.stderr = stderr;
    throw err;
  }
}

// project-context を git repo として初期化する（未初期化のときのみ）。
export function initProjectContext(root) {
  if (!fs.existsSync(path.join(root, '.git'))) {
    git(root, ['init', '-q']);
  }
  // src/ を ignore（設計 03 2 章: 成果物 repo は ignore）。
  const giPath = path.join(root, '.gitignore');
  const want = ['src/', 'out/', ''].join('\n');
  let cur = '';
  if (fs.existsSync(giPath)) cur = fs.readFileSync(giPath, 'utf8');
  if (!/^src\/$/m.test(cur)) {
    fs.writeFileSync(giPath, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + want);
  }
  return root;
}

// project-context の全変更を 1 commit する。変更が無ければ何もしない。
export function autoCommit(root, message) {
  git(root, ['add', '-A']);
  // 変更が staged されているか（差分ゼロなら commit をスキップ）。
  try {
    git(root, ['diff', '--cached', '--quiet']);
    // exit 0 = 差分なし
    return null;
  } catch {
    // exit 非 0 = 差分あり -> commit へ進む
  }
  git(root, ['-c', 'user.name=cc-iasd', '-c', 'user.email=cc-iasd@local', 'commit', '-q', '-m', message]);
  return git(root, ['rev-parse', 'HEAD']).trim();
}

// src/ 側 repo の現在 HEAD commit を返す。
export function baseCommit(repoPath) {
  return git(repoPath, ['rev-parse', 'HEAD']).trim();
}

// src/ 側 repo の base commit からの変更ファイル名一覧を返す。
// working tree の未 commit 変更（tracked + untracked）も含める。
export function diffNames(repoPath, base) {
  const names = new Set();
  // base..working tree の tracked 差分
  const tracked = git(repoPath, ['diff', '--name-only', base]);
  for (const line of tracked.split('\n')) {
    const t = line.trim();
    if (t) names.add(t);
  }
  // untracked ファイル
  const untracked = git(repoPath, ['ls-files', '--others', '--exclude-standard']);
  for (const line of untracked.split('\n')) {
    const t = line.trim();
    if (t) names.add(t);
  }
  return [...names];
}

// base commit からの diff patch テキストを返す（evidence 捕捉用）。
export function diffPatch(repoPath, base) {
  return git(repoPath, ['diff', base]);
}

// repoPath が nested git repo か。
export function isGitRepo(repoPath) {
  return fs.existsSync(path.join(repoPath, '.git'));
}

// テスト・下位ユーティリティ用の低レベル git ラッパを公開。
export { git as _git };
