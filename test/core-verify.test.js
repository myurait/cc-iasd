import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { run, matchGlob } from '../lib/verify.js';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-vf-'));
}

function initSrcRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 't@t'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'base.txt'), 'base\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'base'], { cwd: dir });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
}

test('matchGlob は ** / * / ? を解釈', () => {
  assert.ok(matchGlob('src/api/**', 'src/api/x/y.ts'));
  assert.ok(matchGlob('src/**/infra/**', 'src/api/infra/z.ts'));
  assert.ok(!matchGlob('src/api/*.ts', 'src/api/x/y.ts'));
  assert.ok(matchGlob('src/api/*.ts', 'src/api/y.ts'));
});

test('Checks が pass し off-surface/forbid なしで pass', () => {
  const root = tmpRoot();
  const res = run(root, 'r-1', {
    checks: [{ id: 'ok', run: 'node -e "process.exit(0)"', cwd: root, expect: { exit: 0 } }],
    surfaces: { write: ['src/api/**'], forbid: [] },
    repos: {},
  });
  assert.equal(res.pass, true);
  assert.equal(res.checks[0].pass, true);
  // evidence 捕捉
  const verdictPath = path.join(root, 'evidence', 'verifications', 'r-1', 'verdict.json');
  assert.ok(fs.existsSync(verdictPath));
});

test('Check の exit code 不一致で fail', () => {
  const root = tmpRoot();
  const res = run(root, 'r-2', {
    checks: [{ id: 'bad', run: 'node -e "process.exit(1)"', cwd: root, expect: { exit: 0 } }],
    surfaces: { write: [], forbid: [] },
    repos: {},
  });
  assert.equal(res.pass, false);
  assert.equal(res.checks[0].exit, 1);
  assert.equal(res.checks[0].pass, false);
});

test('forbid glob 該当は機械 FAIL', () => {
  const root = tmpRoot();
  const src = path.join(root, 'workarea', 'api');
  const base = initSrcRepo(src);
  fs.mkdirSync(path.join(src, 'infra'), { recursive: true });
  fs.writeFileSync(path.join(src, 'infra', 'secret.ts'), 'x'); // forbid 面へ変更

  const res = run(root, 'r-3', {
    checks: [],
    surfaces: { write: ['src/api/**'], forbid: ['src/api/infra/**'] },
    repos: { api: { path: src, base } },
  });
  assert.equal(res.pass, false);
  assert.deepEqual(res.surface.forbidden, ['src/api/infra/secret.ts']);
});

test('write glob 外は off-surface として列挙（FAIL にはしない）', () => {
  const root = tmpRoot();
  const src = path.join(root, 'workarea', 'api');
  const base = initSrcRepo(src);
  fs.writeFileSync(path.join(src, 'stray.ts'), 'x'); // write でも forbid でもない

  const res = run(root, 'r-4', {
    checks: [],
    surfaces: { write: ['src/api/allowed/**'], forbid: ['src/api/infra/**'] },
    repos: { api: { path: src, base } },
  });
  assert.deepEqual(res.surface.offSurface, ['src/api/stray.ts']);
  assert.deepEqual(res.surface.forbidden, []);
  assert.equal(res.pass, true); // off-surface は FAIL にしない
});

test('生出力を evidence へ捕捉する', () => {
  const root = tmpRoot();
  run(root, 'r-5', {
    checks: [{ id: 'echo', run: 'node -e "console.log(123)"', cwd: root, expect: { exit: 0 } }],
    surfaces: { write: [], forbid: [] },
    repos: {},
  });
  const out = fs.readFileSync(
    path.join(root, 'evidence', 'verifications', 'r-5', 'echo.stdout.txt'),
    'utf8'
  );
  assert.match(out, /123/);
});
