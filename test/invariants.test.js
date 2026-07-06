import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 契約 6 章の破り試行テスト（すべて「拒否されること」を検証する）。
// 実 CLI を execFile で起動し、決定論ガードが exit 2 / --json 拒否を返すことを確認する。
//   (a) verification なしで run accept -> 拒否
//   (b) 上流欠落（spec の必須セクション空 / blocking gap）で run open -> 欠落列挙つき拒否
//   (c) src/ 配下への書込 -> writePath 例外 / src 内の管理物を doctor が検出
//   (d) blocking gap open のまま spec ready / campaign launch -> 拒否
//   (e) 並列 run: 同一 task の二重 claim / write glob 交差 open -> 拒否

const BIN = path.resolve(fileURLToPath(new URL('../bin/cc-iasd.js', import.meta.url)));
const LIB_WRITEPATH = fileURLToPath(new URL('../lib/writePath.js', import.meta.url));

// exit code を保持したまま実行するため execFileSync の例外経路で status を拾う。
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

// --json 拒否を JSON として解釈する。
function parseJson(stdout) {
  const line = stdout.trim().split('\n').filter(Boolean).pop() || '{}';
  return JSON.parse(line);
}

function tmpRoot(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `cc-inv-${name}-`));
  return root;
}

// project-context を初期化する（require_tty=false / repo 登録つき）。
function initProject(root, { repo = false } = {}) {
  const args = ['init'];
  if (repo) args.push('--repo', 'api:src/api');
  const r = cliResult(root, args);
  assert.equal(r.status, 0, `init 失敗: ${r.stderr}`);
  // decide をヘッドレスで通すため require_tty を落とす。
  fs.writeFileSync(
    path.join(root, 'cc-iasd.yaml'),
    [
      'doc_lang: Japanese',
      'dev_lang: TypeScript',
      ...(repo ? ['repos:', '  - { name: api, path: src/api }'] : ['repos: []']),
      'checks_allowlist: ["npm ", "npx ", "node ", "git "]',
      'decision: { require_tty: false, allow_adopt: false }',
      '',
    ].join('\n')
  );
}

// nested src repo（api）を base commit つきで用意する。
function initSrcRepo(root) {
  const repoPath = path.join(root, 'src', 'api');
  fs.mkdirSync(repoPath, { recursive: true });
  const g = (args) =>
    execFileSync('git', args, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
  g(['init', '-q']);
  g(['config', 'user.name', 'test']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoPath, 'README.md'), 'base\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  return repoPath;
}

const VISION_BODY = `---
id: v001
refs: []
---
# vision: core
## Target Experience
CSV を得られる。
## Non-Goals
PDF は扱わない。
## Boundaries
infra には触れない。
## Capabilities
- export
## Human Decision Points
文字コード。
`;

const SPEC_BODY = ({ tasks = ['- T001 実装'] } = {}) => `---
id: s001
refs:
  - upstream vision:v001
---
# spec: csv
## Requirements
CSV を出力できること。
## Acceptance
行数一致。
## Surfaces
\`\`\`text
write: ["src/api/export/**"]
forbid: ["src/**/infra/**"]
\`\`\`
## Checks
- id: test ; run: "node -e \\"process.exit(0)\\"" ; cwd: src/api ; expect: { exit: 0 }
## Tasks
${tasks.join('\n')}
`;

const CHARTER_BODY = `---
id: c001
refs:
  - covers spec:s001
---
# charter: reporting
## UX Outcome
レポートを得られる。
## Coverage
covers spec:s001
## Depends On
\`\`\`text
depends_on: []
\`\`\`
## Stop Conditions
budget 超過で停止。
## Risk Tiers
tier A: なし。
## Non-Regression Focus
既存 export を壊さない。
## Cross-Checks
全 export の回帰。
`;

// 承認済み vision + ready spec + active campaign を CLI で構築する。
function buildActiveCampaign(root, { tasks } = {}) {
  cliResult(root, ['new', 'vision', 'core']);
  cliResult(root, ['new', 'spec', 'csv']);
  cliResult(root, ['new', 'campaign', 'reporting']);
  fs.writeFileSync(path.join(root, 'vision', 'v001-core.md'), VISION_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's001-csv', 'spec.md'), SPEC_BODY({ tasks }));
  fs.writeFileSync(path.join(root, 'campaigns', 'c001-reporting', 'charter.md'), CHARTER_BODY);
  assertOk(cliResult(root, ['decide', 'd001', '--approve', 'vision:v001']));
  assertOk(cliResult(root, ['review', 'record', 'spec:s001', '--gate', 'spec', '--verdict', 'pass']));
  assertOk(cliResult(root, ['spec', 'ready', 's001']));
  assertOk(cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'launch', '--verdict', 'pass']));
  assertOk(cliResult(root, ['campaign', 'launch', 'c001']));
}

function assertOk(r) {
  assert.equal(r.status, 0, `期待した成功が失敗した: exit=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
  return r;
}

// adhoc run を open し run-id を返す。
function openAdhoc(root, goal, check) {
  const r = assertOk(cliResult(root, ['run', 'open', '--adhoc', goal, '--check', check], []));
  return r.stdout.trim().split('\n').filter(Boolean).pop();
}

const OK_CHECK = 'node -e "process.exit(0)"';

// ==================================================================
// (a) verification なしで run accept -> 拒否
// ==================================================================
test('(a) verification なしの run accept は拒否される', () => {
  const root = tmpRoot('a');
  initProject(root);
  const runId = openAdhoc(root, '調査タスク', OK_CHECK);

  // notes を書いて return までは進める（verify は飛ばす）。
  fs.writeFileSync(path.join(root, 'runs', runId, 'notes.md'), '# notes\n\n## impl\nx\n');
  assertOk(cliResult(root, ['run', 'return', runId]));

  // verify を飛ばして accept -> run-state が verified でないため拒否（exit 2）。
  const acc = cliResult(root, ['run', 'accept', runId]);
  assert.equal(acc.status, 2, `accept は拒否されるべき: ${acc.stdout}${acc.stderr}`);
  const j = parseJson(acc.stdout);
  assert.equal(j.ok, false);
  assert.equal(j.command, `run accept ${runId}`);

  // verify を通した後でも verification.pass が無いと accept できないことを別経路で確認する:
  // fail する check の run を用意し verify(fail) -> accept 拒否（verification 入力欠落）。
  const failCheck = 'node -e "process.exit(1)"';
  const runId2 = openAdhoc(root, '失敗する検証', failCheck);
  fs.writeFileSync(path.join(root, 'runs', runId2, 'notes.md'), '# notes\n\n## impl\ny\n');
  assertOk(cliResult(root, ['run', 'return', runId2]));
  assertOk(cliResult(root, ['run', 'verify', runId2])); // verify 自体は成立（fail verdict を記録）
  const acc2 = cliResult(root, ['run', 'accept', runId2]);
  assert.equal(acc2.status, 2);
  const j2 = parseJson(acc2.stdout);
  assert.ok(
    j2.missing.some((m) => m.input === 'verification'),
    `verification 欠落が列挙されるべき: ${JSON.stringify(j2.missing)}`
  );
});

// ==================================================================
// (b) 上流欠落で run open -> 欠落列挙つき拒否
// ==================================================================
test('(b) 上流欠落（blocking gap / 空セクション）で run open は欠落列挙つき拒否', () => {
  const root = tmpRoot('b');
  initProject(root, { repo: true });
  initSrcRepo(root);
  buildActiveCampaign(root, { tasks: ['- T001 実装', '- T002 テスト'] });

  // blocking gap を spec:s001 に開く。
  assertOk(cliResult(root, ['gap', 'add', 'spec:s001', '--kind', 'needs-human-decision', '--blocking']));

  // campaign 由来 run open は blocking gap により拒否され、欠落が列挙される。
  const r = cliResult(root, ['run', 'open', 'c001', '--tasks', 'T002']);
  assert.equal(r.status, 2, `run open は拒否されるべき: ${r.stdout}`);
  const j = parseJson(r.stdout);
  assert.equal(j.ok, false);
  assert.ok(Array.isArray(j.missing) && j.missing.length > 0, '欠落が列挙されるべき');
  assert.ok(
    j.missing.some((m) => /blocking gap/.test(m.detail)),
    `blocking gap の欠落が列挙されるべき: ${JSON.stringify(j.missing)}`
  );
  // 次の一手が提示される。
  assert.ok(Array.isArray(j.next) && j.next.length > 0, '次コマンドが提示されるべき');
});

// ==================================================================
// (c) src/ 配下への書込 -> writePath 例外 / doctor の汚染検出
// ==================================================================
test('(c) src/ への writePath 書込は例外 / src 内の管理物を doctor が検出', () => {
  const root = tmpRoot('c');
  initProject(root);

  // writePath.write は src/ 配下を WritePathError で拒否する（allowlist 外）。
  const script = `
    import('${LIB_WRITEPATH}').then((m) => {
      try {
        m.write(${JSON.stringify(root)}, 'src/api/x.js', 'contaminate');
        process.stdout.write('NO_ERROR');
        process.exit(0);
      } catch (e) {
        process.stdout.write(e && e.isWritePathError ? 'WRITEPATH_ERROR' : 'OTHER:' + (e && e.name));
        process.exit(3);
      }
    });
  `;
  const wp = cliRaw(['-e', script]);
  assert.equal(wp.status, 3, `src/ 書込は例外になるべき: ${wp.stdout}${wp.stderr}`);
  assert.equal(wp.stdout.trim(), 'WRITEPATH_ERROR');

  // reference/ も同様に拒否される。
  const script2 = script.replace("'src/api/x.js'", "'reference/x.md'");
  const wp2 = cliRaw(['-e', script2]);
  assert.equal(wp2.status, 3);
  assert.equal(wp2.stdout.trim(), 'WRITEPATH_ERROR');

  // src/ 内に管理物（journal など管理領域トップレベル名）を置くと doctor が検出する。
  fs.mkdirSync(path.join(root, 'src', 'journal'), { recursive: true });
  const doc = cliResult(root, ['doctor']);
  assert.equal(doc.status, 1, 'doctor は汚染で非 green になるべき');
  const dj = parseJson(doc.stdout);
  assert.equal(dj.green, false);
  assert.ok(
    dj.errors.some((e) => e.check === 'src-contamination'),
    `src-contamination が検出されるべき: ${JSON.stringify(dj.errors)}`
  );
});

// bin ではなく素の node スクリプトを実行するヘルパ。
function cliRaw(args) {
  try {
    const stdout = execFileSync(process.execPath, args, {
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

// ==================================================================
// (d) blocking gap open のまま spec ready / campaign launch -> 拒否
// ==================================================================
test('(d) blocking gap open のまま spec ready は拒否', () => {
  const root = tmpRoot('d1');
  initProject(root);
  cliResult(root, ['new', 'vision', 'core']);
  cliResult(root, ['new', 'spec', 'csv']);
  fs.writeFileSync(path.join(root, 'vision', 'v001-core.md'), VISION_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's001-csv', 'spec.md'), SPEC_BODY());
  assertOk(cliResult(root, ['decide', 'd001', '--approve', 'vision:v001']));
  assertOk(cliResult(root, ['review', 'record', 'spec:s001', '--gate', 'spec', '--verdict', 'pass']));

  // blocking gap を開く。
  assertOk(cliResult(root, ['gap', 'add', 'spec:s001', '--kind', 'needs-human-decision', '--blocking']));

  const r = cliResult(root, ['spec', 'ready', 's001']);
  assert.equal(r.status, 2, `spec ready は拒否されるべき: ${r.stdout}`);
  const j = parseJson(r.stdout);
  assert.ok(
    j.missing.some((m) => m.input === 'no-blocking-gap'),
    `no-blocking-gap の拒否が列挙されるべき: ${JSON.stringify(j.missing)}`
  );

  // spec は ready へ遷移していない（status は draft のまま）。
  const st = assertOk(cliResult(root, ['status', 'spec:s001']));
  assert.equal(parseJson(st.stdout).status, 'draft');
});

test('(d) blocking gap open のまま campaign launch は拒否', () => {
  const root = tmpRoot('d2');
  initProject(root);
  cliResult(root, ['new', 'vision', 'core']);
  cliResult(root, ['new', 'spec', 'csv']);
  cliResult(root, ['new', 'campaign', 'reporting']);
  fs.writeFileSync(path.join(root, 'vision', 'v001-core.md'), VISION_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's001-csv', 'spec.md'), SPEC_BODY());
  fs.writeFileSync(path.join(root, 'campaigns', 'c001-reporting', 'charter.md'), CHARTER_BODY);
  assertOk(cliResult(root, ['decide', 'd001', '--approve', 'vision:v001']));
  assertOk(cliResult(root, ['review', 'record', 'spec:s001', '--gate', 'spec', '--verdict', 'pass']));
  assertOk(cliResult(root, ['spec', 'ready', 's001']));
  assertOk(cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'launch', '--verdict', 'pass']));

  // coverage 対象 spec に blocking gap を開く -> launch ガードが拒否する。
  assertOk(cliResult(root, ['gap', 'add', 'spec:s001', '--kind', 'needs-human-decision', '--blocking']));

  const r = cliResult(root, ['campaign', 'launch', 'c001']);
  assert.equal(r.status, 2, `campaign launch は拒否されるべき: ${r.stdout}`);
  const j = parseJson(r.stdout);
  assert.ok(
    j.missing.some((m) => m.input === 'no-blocking-gap'),
    `no-blocking-gap の拒否が列挙されるべき: ${JSON.stringify(j.missing)}`
  );

  const st = assertOk(cliResult(root, ['status', 'campaign:c001']));
  assert.equal(parseJson(st.stdout).status, 'draft');
});

// ==================================================================
// (e) 並列 run: 同一 task の二重 claim / write glob 交差 open -> 拒否
// ==================================================================
test('(e) 同一 task の二重 claim / write glob 交差の run open は拒否', () => {
  const root = tmpRoot('e');
  initProject(root, { repo: true });
  initSrcRepo(root);
  buildActiveCampaign(root, { tasks: ['- T001 実装', '- T002 テスト'] });

  // 1 本目の run を open（T001 を claim、write glob src/api/export/** を占有）。
  const first = assertOk(cliResult(root, ['run', 'open', 'c001', '--tasks', 'T001'], []));
  const runId1 = first.stdout.trim().split('\n').filter(Boolean).pop();
  assert.match(runId1, /^r-[0-9A-Z]{26}-/);

  // 同一 task T001 を再度 open -> claim ガードで拒否。
  const dup = cliResult(root, ['run', 'open', 'c001', '--tasks', 'T001']);
  assert.equal(dup.status, 2, `二重 claim は拒否されるべき: ${dup.stdout}`);
  const j = parseJson(dup.stdout);
  assert.ok(
    j.missing.some((m) => m.input === 'claim'),
    `claim 拒否が列挙されるべき: ${JSON.stringify(j.missing)}`
  );
  // 同一 spec 由来のため write glob も交差し、write-glob-cross も列挙される。
  assert.ok(
    j.missing.some((m) => m.input === 'write-glob-cross'),
    `write-glob-cross も列挙されるべき: ${JSON.stringify(j.missing)}`
  );
});
