import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { write, rm, isAllowed, WritePathError } from '../lib/writePath.js';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-wp-'));
}

test('isAllowed は管理領域を許可し src/ reference/ を拒否', () => {
  assert.ok(isAllowed('journal/x.json'));
  assert.ok(isAllowed('specs/s001/spec.md'));
  assert.ok(isAllowed('state.json'));
  assert.ok(isAllowed('cc-iasd.yaml'));
  assert.ok(!isAllowed('src/api/index.ts'));
  assert.ok(!isAllowed('reference/memo.md'));
  assert.ok(!isAllowed('random.txt'));
});

test('write は管理領域へ書き込める', () => {
  const root = tmpRoot();
  const abs = write(root, 'specs/s001/spec.md', '# spec\n');
  assert.ok(fs.existsSync(abs));
  assert.equal(fs.readFileSync(abs, 'utf8'), '# spec\n');
});

test('write は src/ 配下を WritePathError で拒否', () => {
  const root = tmpRoot();
  assert.throws(() => write(root, 'src/api/index.ts', 'x'), WritePathError);
});

test('write は reference/ 配下を拒否', () => {
  const root = tmpRoot();
  assert.throws(() => write(root, 'reference/note.md', 'x'), WritePathError);
});

test('write は root 外への脱出を拒否', () => {
  const root = tmpRoot();
  assert.throws(() => write(root, '../escape.txt', 'x'), WritePathError);
  assert.throws(() => write(root, 'journal/../../escape.txt', 'x'), WritePathError);
});

test('rm は管理領域のファイルを削除', () => {
  const root = tmpRoot();
  const abs = write(root, 'gaps/g001-x.md', 'x');
  rm(root, 'gaps/g001-x.md');
  assert.ok(!fs.existsSync(abs));
});
