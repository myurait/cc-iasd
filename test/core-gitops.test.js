import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  initProjectContext,
  autoCommit,
  baseCommit,
  diffNames,
  diffPatch,
  isGitRepo,
} from '../lib/gitops.js';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-git-'));
}

function initSrcRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });
}

test('initProjectContext は git init し src/ を ignore', () => {
  const root = tmpRoot();
  initProjectContext(root);
  assert.ok(isGitRepo(root));
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^src\/$/m);
});

test('autoCommit は変更をコミットし HEAD を返す、無変更では null', () => {
  const root = tmpRoot();
  initProjectContext(root);
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  fs.writeFileSync(path.join(root, 'journal', 'x.json'), '{}');
  const sha = autoCommit(root, 'first');
  assert.match(sha, /^[0-9a-f]{40}$/);
  const none = autoCommit(root, 'noop');
  assert.equal(none, null);
});

test('baseCommit / diffNames / diffPatch は src repo の差分を返す', () => {
  const src = path.join(tmpRoot(), 'api');
  initSrcRepo(src);
  const base = baseCommit(src);
  assert.match(base, /^[0-9a-f]{40}$/);

  // tracked 変更 + untracked 追加
  fs.writeFileSync(path.join(src, 'base.txt'), 'base\nmore\n');
  fs.writeFileSync(path.join(src, 'new.ts'), 'export const x = 1;\n');

  const names = diffNames(src, base).sort();
  assert.deepEqual(names, ['base.txt', 'new.ts']);

  const patch = diffPatch(src, base);
  assert.match(patch, /base\.txt/);
});

test('diffNames は変更なしで空配列', () => {
  const src = path.join(tmpRoot(), 'api');
  initSrcRepo(src);
  const base = baseCommit(src);
  assert.deepEqual(diffNames(src, base), []);
});
