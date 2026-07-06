import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 契約 6 章の e2e。実 CLI を execFile で起動し、通し経路を green にする:
//   init -> run open --adhoc -> handoff -> 擬似実装（src/ repo にファイル追加 + git commit）
//        -> return -> verify -> review record -> accept
// project-context の各遷移が journal に焼かれ、最終状態が accepted になることを確認する。

const BIN = path.resolve(fileURLToPath(new URL('../bin/cc-iasd.js', import.meta.url)));

function cliResult(root, args, extraFlags = ['--json']) {
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

function statusOf(root, ref) {
  const r = assertOk(cliResult(root, ['status', ref]), `status ${ref}`);
  return JSON.parse(lastLine(r.stdout)).status;
}

// nested src repo（api）を base commit つきで用意する。
function initSrcRepo(root) {
  const repoPath = path.join(root, 'src', 'api');
  fs.mkdirSync(repoPath, { recursive: true });
  const g = (args) => execFileSync('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
  g(['init', '-q']);
  g(['config', 'user.name', 'test']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoPath, 'README.md'), 'base\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  return repoPath;
}

// 擬似実装: src/api/<relFile> を追加して commit する（worker の成果を模す）。
function pseudoImplement(root, relFile, content) {
  const repoPath = path.join(root, 'src', 'api');
  const abs = path.join(repoPath, relFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  const g = (args) => execFileSync('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'impl']);
}

test('e2e: init -> run open --adhoc -> handoff -> 擬似実装 -> return -> verify -> review -> accept', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-e2e-'));

  // 1) init（repo 登録つき）。
  assertOk(cliResult(root, ['init', '--repo', 'api:src/api']), 'init');
  assert.ok(fs.existsSync(path.join(root, 'journal')), 'journal/ が生成される');
  assert.ok(fs.existsSync(path.join(root, 'roles', 'worker.md')), 'worker role card が配置される');

  // src repo に base commit を作る（登録 repo の実体。doctor の repo-registration 検査を通す）。
  initSrcRepo(root);

  // doctor は green。
  const doc0 = assertOk(cliResult(root, ['doctor']), 'doctor(初期)');
  assert.equal(JSON.parse(lastLine(doc0.stdout)).green, true);

  // 2) run open --adhoc（成功する check + write surface を指定）。
  const check = 'node -e "process.exit(0)"';
  const opened = assertOk(
    cliResult(root, ['run', 'open', '--adhoc', 'エンドポイント追加', '--check', check, '--surface', 'src/api/**'], []),
    'run open'
  );
  const runId = lastLine(opened.stdout);
  assert.match(runId, /^r-[0-9A-Z]{26}-/, `run-id 形式: ${runId}`);
  assert.equal(statusOf(root, `run:${runId}`), 'handed-off', 'open 後は handed-off');
  // handoff.md が runs/ と out/ に生成される。
  assert.ok(fs.existsSync(path.join(root, 'runs', runId, 'handoff.md')));
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'handoff.md')));

  // 3) run handoff -> stdout に handoff 本文（正本経路）。
  const ho = assertOk(cliResult(root, ['run', 'handoff', runId], []), 'run handoff');
  assert.match(ho.stdout, /エンドポイント追加/, 'handoff に goal が含まれる');
  assert.match(ho.stdout, /Exit Protocol/, 'handoff に Exit Protocol が含まれる');

  // 4) 擬似実装: src/api にファイルを追加して commit（write surface 内）+ worker notes。
  pseudoImplement(root, 'handler.js', 'export function handler() { return 200; }\n');
  fs.writeFileSync(
    path.join(root, 'runs', runId, 'notes.md'),
    '# notes\n\n## 実装メモ\nhandler を追加した。\n'
  );

  // 5) run return -> returned（diff-snapshot が note.appended として記録される）。
  assertOk(cliResult(root, ['run', 'return', runId]), 'run return');
  assert.equal(statusOf(root, `run:${runId}`), 'returned', 'return 後は returned');

  // 6) run verify -> verified（surface 内変更のみのため pass）。
  const vr = assertOk(cliResult(root, ['run', 'verify', runId], []), 'run verify');
  assert.match(vr.stdout, /:\s*pass\b/, `verify は pass すべき: ${vr.stdout}`);
  assert.equal(statusOf(root, `run:${runId}`), 'verified', 'verify 後は verified');
  // verdict が evidence へ捕捉される。surface 判定は verdict.json を正本として読む。
  const verdictPath = path.join(root, 'evidence', 'verifications', runId, 'verdict.json');
  assert.ok(fs.existsSync(verdictPath), 'verdict.json が捕捉される');
  const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
  assert.equal(verdict.pass, true, `verdict.pass=true であるべき: ${JSON.stringify(verdict)}`);
  assert.equal(verdict.surface.forbidden.length, 0, 'forbidden 変更なし');
  assert.equal(verdict.surface.offSurface.length, 0, 'off-surface 変更なし（handler.js は write glob 内）');

  // 7) review record（gate=run。notes の content-hash を刻印）。
  assertOk(
    cliResult(root, ['review', 'record', `run:${runId}`, '--gate', 'run', '--verdict', 'pass']),
    'review record run'
  );

  // 8) run accept -> accepted。
  assertOk(cliResult(root, ['run', 'accept', runId]), 'run accept');
  assert.equal(statusOf(root, `run:${runId}`), 'accepted', 'accept 後は accepted');

  // 通し後も doctor は green（参照解決 / guard 再計算 / frontmatter 一致 / 汚染なし）。
  const doc1 = assertOk(cliResult(root, ['doctor']), 'doctor(最終)');
  const dj = JSON.parse(lastLine(doc1.stdout));
  assert.equal(dj.green, true, `最終 doctor は green であるべき: ${JSON.stringify(dj.errors)}`);
});

test('e2e: off-surface 変更は verify で off-surface として列挙される', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-e2e-off-'));
  assertOk(cliResult(root, ['init', '--repo', 'api:src/api']), 'init');
  initSrcRepo(root);

  // write surface を狭く（src/api/export/** のみ）指定して open。
  const check = 'node -e "process.exit(0)"';
  const opened = assertOk(
    cliResult(root, ['run', 'open', '--adhoc', '狭い面', '--check', check, '--surface', 'src/api/export/**'], []),
    'run open'
  );
  const runId = lastLine(opened.stdout);

  // write glob 外（src/api/other.js）を変更 -> off-surface として列挙される（FAIL にはしない）。
  pseudoImplement(root, 'other.js', 'off surface change\n');
  fs.writeFileSync(path.join(root, 'runs', runId, 'notes.md'), '## impl\nx\n');
  assertOk(cliResult(root, ['run', 'return', runId]), 'run return');

  assertOk(cliResult(root, ['run', 'verify', runId], []), 'run verify');
  const verdict = JSON.parse(
    fs.readFileSync(path.join(root, 'evidence', 'verifications', runId, 'verdict.json'), 'utf8')
  );
  assert.ok(
    verdict.surface.offSurface.includes('src/api/other.js'),
    `off-surface に列挙されるべき: ${JSON.stringify(verdict.surface)}`
  );
  // check は pass、forbidden も無いため verdict.pass は true（off-surface は FAIL にしない）。
  assert.equal(verdict.pass, true);
});
