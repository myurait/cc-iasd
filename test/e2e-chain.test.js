import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// full-chain e2e（実 CLI）。P2 の chain（authoring / humans / run）と covers 射影を
// 結線し、次の通し経路が green になることを検証する:
//   init -> new vision（Capabilities 2 件）-> decide --approve
//        -> new spec x2（covers 宣言つき。s002 は charter Coverage で after: [s001]）
//        -> gap 起票 + decide + gap close -> review record(gate=spec) x2 -> spec ready x2
//        -> new campaign（coverage / cross-checks）-> review record(gate=launch) -> launch
//        -> run open(s001 tasks) / s002 run open は順序制約で拒否
//        -> s001 run return / verify / review / accept
//        -> s002 run 完走 -> status --plan の covered/uncovered 射影 assert
//        -> review record(gate=completion) -> report -> campaign close -> closed
//
// 設計正本: 05（遷移ガード・coverage 順序制約）/ 06（covers 射影・charter Cross-Checks）/
// 08（コマンド構文）/ rework 08（P1 契約）。cross-checks は charter の 1 節であり
// completion gate review の対象（06 charter 節・templates/charter_template.md）。
// close が別途「実行」する経路は正本に無い（最終報告 open question 参照）。

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

function statusJson(root, ref) {
  const r = assertOk(cliResult(root, ['status', ref]), `status ${ref}`);
  return JSON.parse(lastLine(r.stdout));
}

function statusOf(root, ref) {
  return statusJson(root, ref).status;
}

function planJson(root) {
  const r = assertOk(cliResult(root, ['status'], ['--plan', '--json']), 'status --plan');
  return JSON.parse(lastLine(r.stdout));
}

// require_tty=false / repo 登録つきで init（decide をヘッドレスで通す）。
function initProject(root) {
  assertOk(cliResult(root, ['init', '--repo', 'api:src/api']), 'init');
  fs.writeFileSync(
    path.join(root, 'cc-iasd.yaml'),
    [
      'doc_lang: Japanese',
      'dev_lang: TypeScript',
      'repos:',
      '  - { name: api, path: src/api }',
      'checks_allowlist: ["npm ", "npx ", "node ", "git "]',
      'decision: { require_tty: false, allow_adopt: false }',
      '',
    ].join('\n')
  );
}

function initSrcRepo(root) {
  const repoPath = path.join(root, 'src', 'api');
  fs.mkdirSync(repoPath, { recursive: true });
  const g = (a) => execFileSync('git', a, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
  g(['init', '-q']);
  g(['config', 'user.name', 'test']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoPath, 'README.md'), 'base\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  return repoPath;
}

function pseudoImplement(root, relFile, content) {
  const repoPath = path.join(root, 'src', 'api');
  const abs = path.join(repoPath, relFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  const g = (a) => execFileSync('git', a, { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] });
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'impl']);
}

const OK_CHECK = 'node -e "process.exit(0)"';

// vision: 2 capability（cap-export / cap-import）を宣言。covers 射影の宣言正本。
const VISION_BODY = `---
id: v001
refs: []
---
# vision: core
## Target Experience
CSV / JSON を得られる。
## Non-Goals
PDF は扱わない。
## Boundaries
infra には触れない。
## Capabilities
- [ ] cap-export: CSV/JSON を書き出せる
- [ ] cap-import: 外部データを取り込める
## Human Decision Points
文字コード。
`;

// spec s001: cap-export を covers。write 面 export/**。
const SPEC1_BODY = `---
id: s001
refs:
  - { rel: upstream, to: vision:v001 }
  - { rel: covers, to: cap-export }
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
- id: test ; run: "${OK_CHECK}" ; cwd: src/api ; expect: { exit: 0 }
## Tasks
- T101 export 実装
- T102 export テスト
`;

// spec s002: cap-import を covers。write 面 import/**（s001 と非交差）。
const SPEC2_BODY = `---
id: s002
refs:
  - { rel: upstream, to: vision:v001 }
  - { rel: covers, to: cap-import }
---
# spec: import
## Requirements
外部データを取り込めること。
## Acceptance
件数一致。
## Surfaces
\`\`\`text
write: ["src/api/import/**"]
forbid: ["src/**/infra/**"]
\`\`\`
## Checks
- id: test ; run: "${OK_CHECK}" ; cwd: src/api ; expect: { exit: 0 }
## Tasks
- T201 import 実装
- T202 import テスト
`;

// campaign c001: s001 / s002 を covers。Coverage で s002 に after: [s001] を宣言。
// covers cap-* も併記して covers 射影を artifact 経由で成立させる。
const CHARTER_BODY = `---
id: c001
refs:
  - { rel: covers, to: spec:s001 }
  - { rel: covers, to: spec:s002 }
---
# charter: reporting
## UX Outcome
レポートを得られる。
## Coverage
covers spec:s001
covers spec:s002 after: [s001]
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
全 export / import の回帰確認。
`;

// campaign 由来 run を open -> return -> verify -> review -> accept まで進め run-id を返す。
function runCampaignTasks(root, tasks, relFile) {
  const opened = assertOk(
    cliResult(root, ['run', 'open', 'c001', '--tasks', tasks.join(',')], []),
    `run open ${tasks.join(',')}`
  );
  const runId = lastLine(opened.stdout);
  assert.match(runId, /^r-[0-9A-Z]{26}-/, `run-id 形式: ${runId}`);
  assert.equal(statusOf(root, `run:${runId}`), 'handed-off', 'open 後は handed-off');

  pseudoImplement(root, relFile, `export const x = 1;\n`);
  fs.writeFileSync(path.join(root, 'runs', runId, 'notes.md'), `# notes\n\n## impl\n${tasks.join(',')} を実装。\n`);
  assertOk(cliResult(root, ['run', 'return', runId]), 'run return');
  assertOk(cliResult(root, ['run', 'verify', runId], []), 'run verify');
  assertOk(
    cliResult(root, ['review', 'record', `run:${runId}`, '--gate', 'run', '--verdict', 'pass']),
    'review run'
  );
  assertOk(cliResult(root, ['run', 'accept', runId]), 'run accept');
  assert.equal(statusOf(root, `run:${runId}`), 'accepted', 'accept 後は accepted');
  return runId;
}

// ==================================================================
// full-chain 通し（2 spec / coverage 順序制約 / covers 射影）
// ==================================================================
test('full-chain e2e: vision(2cap) -> spec x2 -> campaign -> 順序制約 -> run x2 -> report -> close', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-e2e-chain-'));
  initProject(root);
  initSrcRepo(root);

  // --- scaffold（new）と本文配置 ---
  assertOk(cliResult(root, ['new', 'vision', 'core']), 'new vision');
  assertOk(cliResult(root, ['new', 'spec', 'csv']), 'new spec s001');
  assertOk(cliResult(root, ['new', 'spec', 'import']), 'new spec s002');
  assertOk(cliResult(root, ['new', 'campaign', 'reporting']), 'new campaign');
  fs.writeFileSync(path.join(root, 'vision', 'v001-core.md'), VISION_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's001-csv', 'spec.md'), SPEC1_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's002-import', 'spec.md'), SPEC2_BODY);
  fs.writeFileSync(path.join(root, 'campaigns', 'c001-reporting', 'charter.md'), CHARTER_BODY);

  // --- vision 承認（decide --approve）---
  assertOk(cliResult(root, ['decide', 'd001', '--approve', 'vision:v001']), 'decide vision');
  assert.equal(statusOf(root, 'vision:v001'), 'approved', 'vision は approved');

  // --- gap 起票 + decide + gap close（未解決事項の台帳サイクル）---
  // s002 に対する human-decision gap を blocking で起票し、decision で close する。
  const gapAdd = assertOk(
    cliResult(root, ['gap', 'add', 'spec:s002', '--kind', 'needs-human-decision', '--blocking']),
    'gap add'
  );
  const gid = JSON.parse(lastLine(gapAdd.stdout)).gap.replace(/^gap:/, '');
  assert.match(gid, /^g\d+$/, `gap id 形式: ${gid}`);
  // blocking gap open のうちは下流（spec s002 ready）が拒否されることを確認する（破り試行 d と同型）。
  const readyBlocked = cliResult(root, ['spec', 'ready', 's002']);
  assert.equal(readyBlocked.status, 2, `blocking gap open 中の spec ready は拒否: ${readyBlocked.stdout}`);

  assertOk(cliResult(root, ['decide', 'd002']), 'decide gap 解消');
  assertOk(cliResult(root, ['gap', 'close', gid, '--decision', 'd002']), 'gap close by decision');
  assert.equal(statusJson(root, 'spec:s002').status, 'draft', 'gap close 後も s002 は draft（ready 前）');

  // --- review record(gate=spec) x2 -> spec ready x2 ---
  for (const sid of ['s001', 's002']) {
    assertOk(
      cliResult(root, ['review', 'record', `spec:${sid}`, '--gate', 'spec', '--verdict', 'pass']),
      `review spec ${sid}`
    );
    assertOk(cliResult(root, ['spec', 'ready', sid]), `spec ready ${sid}`);
    assert.equal(statusOf(root, `spec:${sid}`), 'ready', `${sid} は ready`);
  }

  // spec ready で covers cap-* が journal（node.refs）へ写像されていること（06 2.3）。
  const s1refs = statusJson(root, 'spec:s001').refs || [];
  assert.ok(
    s1refs.some((r) => r.rel === 'covers' && r.to === 'cap-export'),
    `spec:s001 の refs に covers cap-export が写像されるべき: ${JSON.stringify(s1refs)}`
  );

  // --- review record(gate=launch) -> campaign launch ---
  assertOk(
    cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'launch', '--verdict', 'pass']),
    'review launch'
  );
  assertOk(cliResult(root, ['campaign', 'launch', 'c001']), 'campaign launch');
  assert.equal(statusOf(root, 'campaign:c001'), 'active', 'campaign は active');
  // launch で coverage spec が ready -> in-campaign（05 2 章）。
  assert.equal(statusOf(root, 'spec:s001'), 'in-campaign', 's001 は in-campaign');
  assert.equal(statusOf(root, 'spec:s002'), 'in-campaign', 's002 は in-campaign');

  // --- 順序制約: s002 の run open は s001 未 accepted のため拒否される ---
  const s2early = cliResult(root, ['run', 'open', 'c001', '--tasks', 'T201,T202'], ['--json']);
  assert.equal(s2early.status, 2, `s001 未 accepted のうち s002 run open は拒否: ${s2early.stdout}${s2early.stderr}`);
  const s2j = JSON.parse(lastLine(s2early.stdout));
  assert.equal(s2j.ok, false);
  assert.ok(
    s2j.missing.some((m) => /coverage-order|先行 accepted 未達|spec:s001/.test(`${m.input} ${m.detail}`)),
    `coverage 順序制約による拒否が列挙されるべき: ${JSON.stringify(s2j.missing)}`
  );

  // --- s001 の run を open -> return -> verify -> review -> accept（順序制約下でも先行は通る）---
  runCampaignTasks(root, ['T101', 'T102'], 'export/a.js');

  // s001 accepted 後は s002 の run open が通る。
  const s2ok = assertOk(cliResult(root, ['run', 'open', 'c001', '--tasks', 'T201,T202'], []), 'run open s002 tasks');
  const s2run = lastLine(s2ok.stdout);
  // run の upstream ref（buildOpenRefs）が対象 spec を指すことで解決先を確認する。
  const s2runRefs = statusJson(root, `run:${s2run}`).refs || [];
  assert.ok(
    s2runRefs.some((r) => r.rel === 'upstream' && r.to === 'spec:s002'),
    `s002 tasks の run は spec:s002 を upstream に持つべき: ${JSON.stringify(s2runRefs)}`
  );
  // s002 の run を完走させる。
  pseudoImplement(root, 'import/b.js', 'export const y = 1;\n');
  fs.writeFileSync(path.join(root, 'runs', s2run, 'notes.md'), '# notes\n\n## impl\nT201,T202 を実装。\n');
  assertOk(cliResult(root, ['run', 'return', s2run]), 'run return s002');
  assertOk(cliResult(root, ['run', 'verify', s2run], []), 'run verify s002');
  assertOk(
    cliResult(root, ['review', 'record', `run:${s2run}`, '--gate', 'run', '--verdict', 'pass']),
    'review run s002'
  );
  assertOk(cliResult(root, ['run', 'accept', s2run]), 'run accept s002');
  assert.equal(statusOf(root, `run:${s2run}`), 'accepted', 's002 run は accepted');

  // --- status --plan の covers 射影 assert（covered / uncovered）---
  const plan = planJson(root);
  const capIds = plan.capabilities.map((c) => c.id).sort();
  assert.deepEqual(capIds, ['cap-export', 'cap-import'], `capability 2 件が射影されるべき: ${JSON.stringify(capIds)}`);
  const capExport = plan.capabilities.find((c) => c.id === 'cap-export');
  const capImport = plan.capabilities.find((c) => c.id === 'cap-import');
  assert.equal(capExport.covered, true, 'cap-export は spec:s001 でカバー済み');
  assert.ok(
    capExport.covered_by.some((s) => s.ref === 'spec:s001'),
    `cap-export のカバー元に spec:s001 が居るべき: ${JSON.stringify(capExport.covered_by)}`
  );
  assert.equal(capImport.covered, true, 'cap-import は spec:s002 でカバー済み');
  assert.deepEqual(plan.uncovered_capabilities, [], `未カバー capability は無いべき: ${JSON.stringify(plan.uncovered_capabilities)}`);

  // --- completion review -> report -> close（cross-checks は charter 節 = completion review 対象）---
  assertOk(
    cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'completion', '--verdict', 'pass']),
    'review completion'
  );
  assertOk(cliResult(root, ['report', 'campaign:c001'], []), 'report campaign');
  assert.ok(
    fs.existsSync(path.join(root, 'out', 'c001', 'report.md')),
    'report は out/c001/report.md へ出力されるべき'
  );

  const close = assertOk(cliResult(root, ['campaign', 'close', 'c001'], []), 'campaign close');
  assert.match(close.stdout, /closed/, `close は成功すべき: ${close.stdout}`);
  assert.equal(statusOf(root, 'campaign:c001'), 'closed', 'close 後 campaign は closed');
  // close で coverage spec が in-campaign -> done（05 2 章）。
  assert.equal(statusOf(root, 'spec:s001'), 'done', 's001 は done');
  assert.equal(statusOf(root, 'spec:s002'), 'done', 's002 は done');
});

// ==================================================================
// 順序制約: after 宣言が無い spec は先行 accepted 不要で open できる
// （coverage-order の対象 spec スコープ化が s001 自身を巻き込まないことの確認）
// ==================================================================
test('coverage 順序制約: after を持たない対象 spec は先行なしで run open できる', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-e2e-order-'));
  initProject(root);
  initSrcRepo(root);

  assertOk(cliResult(root, ['new', 'vision', 'core']), 'new vision');
  assertOk(cliResult(root, ['new', 'spec', 'csv']), 'new spec s001');
  assertOk(cliResult(root, ['new', 'spec', 'import']), 'new spec s002');
  assertOk(cliResult(root, ['new', 'campaign', 'reporting']), 'new campaign');
  fs.writeFileSync(path.join(root, 'vision', 'v001-core.md'), VISION_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's001-csv', 'spec.md'), SPEC1_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's002-import', 'spec.md'), SPEC2_BODY);
  fs.writeFileSync(path.join(root, 'campaigns', 'c001-reporting', 'charter.md'), CHARTER_BODY);

  assertOk(cliResult(root, ['decide', 'd001', '--approve', 'vision:v001']), 'decide vision');
  for (const sid of ['s001', 's002']) {
    assertOk(
      cliResult(root, ['review', 'record', `spec:${sid}`, '--gate', 'spec', '--verdict', 'pass']),
      `review spec ${sid}`
    );
    assertOk(cliResult(root, ['spec', 'ready', sid]), `spec ready ${sid}`);
  }
  assertOk(
    cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'launch', '--verdict', 'pass']),
    'review launch'
  );
  assertOk(cliResult(root, ['campaign', 'launch', 'c001']), 'campaign launch');

  // after 宣言を持たない s001 の tasks は先行 accepted なしで open できる（対象 spec スコープ）。
  const opened = assertOk(cliResult(root, ['run', 'open', 'c001', '--tasks', 'T101'], []), 'run open s001 first');
  const rid = lastLine(opened.stdout);
  const ridRefs = statusJson(root, `run:${rid}`).refs || [];
  assert.ok(
    ridRefs.some((r) => r.rel === 'upstream' && r.to === 'spec:s001'),
    `s001 tasks の run は spec:s001 を upstream に持つべき: ${JSON.stringify(ridRefs)}`
  );
  assert.equal(statusOf(root, `run:${rid}`), 'handed-off', 's001 の run は先行なしで開ける');
});
