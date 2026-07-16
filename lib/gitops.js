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
    const stdout = e.stdout ? String(e.stdout) : '';
    const err = new Error(`git ${args.join(' ')} 失敗: ${stderr || e.message}`);
    err.cause = e;
    err.stderr = stderr;
    err.stdout = stdout;
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

// repoPath の working tree が dirty か（git status --porcelain が非空なら dirty）。
// tracked の未 commit 変更・untracked ファイルの双方を含む。
export function isDirty(repoPath) {
  const out = git(repoPath, ['status', '--porcelain']);
  return out.trim().length > 0;
}

// --- worktree 隔離（並列 run の強い隔離。設計 09 4.3 / 03 7.3 / 05 7 章） ---

// repoPath の base ブランチ（現在 HEAD）名を返す。detached HEAD 等で
// symbolic-ref が取れない場合は commit SHA を返す（後段 merge の対象として使える）。
export function currentBranch(repoPath) {
  try {
    return git(repoPath, ['symbolic-ref', '--short', 'HEAD']).trim();
  } catch {
    return git(repoPath, ['rev-parse', 'HEAD']).trim();
  }
}

// base（commit SHA もしくはブランチ名）から隔離ブランチ branch を切り、
// worktreePath に worktree を作成する。親ディレクトリは事前に作る。
// worktree の実体 path は project-context 外・src repo の .git 管理下で任意に置ける
// （out/<run-id>/wt/<repo> 等。git worktree の追跡は path に依らない）。
export function worktreeAdd(repoPath, worktreePath, branch, base) {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  // -b <branch> <path> <base>: base から branch を新規作成し worktree を張る。
  git(repoPath, ['worktree', 'add', '-b', branch, worktreePath, base]);
  return { path: worktreePath, branch };
}

// worktree を削除する。既定 force=false（dirty / 未 commit があれば git が非 0 で失敗する）。
// force=true のときのみ --force を付け強制削除する（契約 1 章）。
// 戻り値 { removed:bool, dirty?:bool, detail?:string }。removed 成功時のみ prune を回収する。
// 呼出側（cleanup / accept）は removed / dirty を見て残置理由を journal に記録する。
export function worktreeRemove(repoPath, worktreePath, { force = false } = {}) {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);
  let removed = false;
  let dirty = false;
  let detail;
  try {
    git(repoPath, args);
    removed = true;
  } catch (e) {
    detail = e.stderr || e.message;
    // 削除失敗の主因が worktree の dirty かを実体 status で判定する（決定論）。
    try {
      if (fs.existsSync(worktreePath) && isDirty(worktreePath)) dirty = true;
    } catch {
      /* 実体が既に無い等は dirty 判定不能 */
    }
  }
  // 掃除の取りこぼし（削除済み path の残エントリ）を prune で回収する（削除成功時のみ）。
  if (removed) {
    try {
      git(repoPath, ['worktree', 'prune']);
    } catch {
      /* noop */
    }
  }
  return { removed, dirty, detail };
}

// worktree 実体（worktreePath を repo とみなした working tree）が dirty か。
// cleanup / accept の残置判定に使う（isDirty の別名）。
export function worktreeIsDirty(worktreePath) {
  return isDirty(worktreePath);
}

// maybeAncestor が descendant の祖先か（git merge-base --is-ancestor の exit 判定）。
// exit0=祖先（true）/ exit1=非祖先 / その他エラーは false。base 進行検査・cleanup に使う（決定論）。
export function isAncestor(repoPath, maybeAncestor, descendant) {
  try {
    git(repoPath, ['merge-base', '--is-ancestor', maybeAncestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

// active run の worktree を lock する（誤削除・並列干渉を防ぐ）。
// 既に lock 済み等の失敗は無害化する（契約 4 章）。
export function worktreeLock(repoPath, worktreePath, reason) {
  try {
    git(repoPath, ['worktree', 'lock', '--reason', reason, worktreePath]);
  } catch {
    /* noop: 既に lock 済み / 実体無し等 */
  }
}

// worktree の lock を外す（remove 前に呼ぶ。lock 済みは remove が拒否されるため）。
export function worktreeUnlock(repoPath, worktreePath) {
  try {
    git(repoPath, ['worktree', 'unlock', worktreePath]);
  } catch {
    /* noop: lock されていない / 実体無し等 */
  }
}

// 隔離ブランチ branch を baseBranch へ --no-ff で merge する。
// conflict なら merge を abort して { ok:false, conflicts:[...] } を返す（決定論検出）。
// 成功なら { ok:true, head:<merge 後 HEAD SHA> }。
export function worktreeMerge(repoPath, baseBranch, branch) {
  // merge は base ブランチ側 working tree（repoPath 本体）で行う。
  try {
    git(repoPath, ['merge', '--no-ff', '--no-edit', branch]);
    const head = git(repoPath, ['rev-parse', 'HEAD']).trim();
    return { ok: true, head };
  } catch (e) {
    // conflict もしくは他の merge 失敗。conflict ファイルを列挙してから abort する。
    let conflicts = [];
    try {
      const out = git(repoPath, ['diff', '--name-only', '--diff-filter=U']);
      conflicts = out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      /* conflict 一覧が取れない場合も abort は行う */
    }
    try {
      git(repoPath, ['merge', '--abort']);
    } catch {
      /* merge 状態でなければ abort 不要 */
    }
    return { ok: false, conflicts, detail: e.stderr || e.message };
  }
}

// baseBranch へ branch を merge できるか（実 merge せず）判定する。
// merge-tree（3-way）の出力に conflict マーカが出れば conflict とみなす。
// working tree を汚さないため verify 段の dry-run 検査に使う。
// 戻り値: { ok:true } もしくは { ok:false, conflicts:[...] }。
export function worktreeMergeDryRun(repoPath, baseBranch, branch) {
  // merge-base を取り、3-way merge-tree で衝突を検出する。
  let mergeBase;
  try {
    mergeBase = git(repoPath, ['merge-base', baseBranch, branch]).trim();
  } catch (e) {
    return { ok: false, conflicts: [], detail: `merge-base 取得失敗: ${e.stderr || e.message}` };
  }
  let out = '';
  try {
    // 旧 merge-tree（<base> <branch1> <branch2>）は衝突箇所を "<<<<<<<" 付きで
    // stdout に出し exit 0 で終わる（git 2.45 で確認）。この出力を conflict マーカで判定する。
    out = git(repoPath, ['merge-tree', mergeBase, baseBranch, branch]);
  } catch (e) {
    // 新 git（旧 merge-tree が deprecated / `--write-tree` 系）は conflict 時に非 0 で
    // 終わり、CONFLICT 行を stdout に出す。git() ラッパは失敗時 stdout も保持する。
    const combined = (e.stdout || '') + (e.stderr || '');
    if (/CONFLICT|<<<<<<< /i.test(combined)) {
      const conflicts = [...combined.matchAll(/CONFLICT\s*\([^)]*\):\s*(.+)/g)].map((m) => m[1].trim());
      return { ok: false, conflicts, detail: 'merge dry-run で conflict' };
    }
    // conflict でない失敗（無関係 history 等）は conflict なしとして扱い、後続の実 merge に委ねる。
    return { ok: true, conflicts: [] };
  }
  if (/<<<<<<< /.test(out)) {
    return { ok: false, conflicts: [], detail: 'merge dry-run で conflict マーカ検出' };
  }
  return { ok: true, conflicts: [] };
}

// テスト・下位ユーティリティ用の低レベル git ラッパを公開。
export { git as _git };
