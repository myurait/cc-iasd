import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.resolve(fileURLToPath(new URL('../bin/cc-iasd.js', import.meta.url)));

function cli(args, opts = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...opts });
}

test('--help は usage を出力し exit 0', () => {
  const r = cli(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});

test('--version は version を出力', () => {
  const r = cli(['--version']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /0\.1\.0/);
});

test('未知コマンドは exit 1', () => {
  const r = cli(['bogus-command']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /未知のコマンド/);
});
