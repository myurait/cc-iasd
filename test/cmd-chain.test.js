import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// full-chain gate 運用の系列テスト。実 CLI を execFile で起動し、
// vision approve -> spec ready -> campaign launch -> run open(campaign --tasks) ->
// return -> verify -> review -> accept -> report -> campaign close の通し経路が
// green になること、および P2 chain の各 gap 修正を確認する:
//   - frontmatter refs の遷移時取込（06 2.3）: spec ready / campaign launch で
//     covers / upstream refs が journal（node.refs）へ写像される
//   - spec 状態列（05 2 章）: draft -> ready -> in-campaign -> done が完走する
//   - campaign close の全 task チェック済（05 3 章）: run.tasks 配列消化で pass
//   - completion report 存在（05 3 章 / P1 契約 5 章）: out/<campaign-id>/report.md

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

function refsOf(root, ref) {
  return statusJson(root, ref).refs || [];
}

function hasRef(refs, rel, to) {
  return refs.some((r) => r && r.rel === rel && r.to === to);
}

// require_tty=false / repo 登録つきで init する（decide をヘッドレスで通す）。
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

// spec frontmatter の refs。doctor の frontmatter-refs 整合検査（journal ⊆ frontmatter）を
// 通すため、両パーサ（authoring / doctor）が一致して正規化する {rel, to} 形で宣言する。
// 単一キー map 形（- upstream: vision:v001）のパースは別途 unit 側で検証する（gap 5）。
const SPEC_BODY = `---
id: s001
refs:
  - { rel: upstream, to: vision:v001 }
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
- T001 実装
- T002 テスト
`;

const CHARTER_BODY = `---
id: c001
refs:
  - { rel: covers, to: spec:s001 }
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

// campaign を active にするまでを CLI で構築する。charterBody を渡せば差し替える
// （Cross-Checks 節を実行可能 check にしたテスト等）。
function buildActiveCampaign(root, charterBody = CHARTER_BODY) {
  assertOk(cliResult(root, ['new', 'vision', 'core']), 'new vision');
  assertOk(cliResult(root, ['new', 'spec', 'csv']), 'new spec');
  assertOk(cliResult(root, ['new', 'campaign', 'reporting']), 'new campaign');
  fs.writeFileSync(path.join(root, 'vision', 'v001-core.md'), VISION_BODY);
  fs.writeFileSync(path.join(root, 'specs', 's001-csv', 'spec.md'), SPEC_BODY);
  fs.writeFileSync(path.join(root, 'campaigns', 'c001-reporting', 'charter.md'), charterBody);
  assertOk(cliResult(root, ['decide', 'd001', '--approve', 'vision:v001']), 'decide vision');
  assertOk(cliResult(root, ['review', 'record', 'spec:s001', '--gate', 'spec', '--verdict', 'pass']), 'review spec');
  assertOk(cliResult(root, ['spec', 'ready', 's001']), 'spec ready');
  assertOk(cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'launch', '--verdict', 'pass']), 'review launch');
  assertOk(cliResult(root, ['campaign', 'launch', 'c001']), 'campaign launch');
}

// Cross-Checks 節に CLI 実行可能な check を持つ charter を組み立てる（cmd 記法は spec の Checks と同一）。
function charterWithCrossChecks(crossChecksBody) {
  return `---
id: c001
refs:
  - { rel: covers, to: spec:s001 }
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
${crossChecksBody}
`;
}

// campaign を close 直前（全 task 消化 + completion review + report 済み）まで進める。
function readyToClose(root, charterBody) {
  initProject(root);
  initSrcRepo(root);
  buildActiveCampaign(root, charterBody);
  runCampaignTasks(root, ['T001', 'T002'], 'a.js');
  assertOk(
    cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'completion', '--verdict', 'pass']),
    'review completion'
  );
  assertOk(cliResult(root, ['report', 'campaign:c001'], []), 'report campaign');
}

// campaign 由来 run を open -> return -> verify -> review -> accept まで進め run-id を返す。
function runCampaignTasks(root, tasks, relFile) {
  const opened = assertOk(
    cliResult(root, ['run', 'open', 'c001', '--tasks', tasks.join(',')], []),
    'run open campaign'
  );
  const runId = lastLine(opened.stdout);
  assert.match(runId, /^r-[0-9A-Z]{26}-/, `run-id 形式: ${runId}`);
  assert.equal(statusOf(root, `run:${runId}`), 'handed-off', 'open 後は handed-off');

  pseudoImplement(root, relFile, `export const ${relFile.replace(/\W/g, '_')} = 1;\n`);
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
// full-chain 通し
// ==================================================================
test('full-chain: vision -> spec -> campaign -> run(campaign) -> report -> close が完走する', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-chain-'));
  initProject(root);
  initSrcRepo(root);

  buildActiveCampaign(root);

  // --- gap 3/5: spec ready で frontmatter refs（- upstream: vision:v001）が journal へ写像 ---
  const specRefs = refsOf(root, 'spec:s001');
  assert.ok(
    hasRef(specRefs, 'upstream', 'vision:v001'),
    `spec:s001 の refs に upstream vision:v001 が写像されるべき: ${JSON.stringify(specRefs)}`
  );

  // --- gap 6: campaign launch で coverage spec が ready -> in-campaign ---
  assert.equal(statusOf(root, 'spec:s001'), 'in-campaign', 'launch 後 coverage spec は in-campaign');
  assert.equal(statusOf(root, 'campaign:c001'), 'active', 'campaign は active');

  // --- gap 3/5: campaign launch で covers spec:s001 が journal へ写像 ---
  const campRefs = refsOf(root, 'campaign:c001');
  assert.ok(
    hasRef(campRefs, 'covers', 'spec:s001'),
    `campaign:c001 の refs に covers spec:s001 が写像されるべき: ${JSON.stringify(campRefs)}`
  );

  // --- gap 1: campaign 由来 run が --tasks T001,T002 を claim/消化する ---
  runCampaignTasks(root, ['T001', 'T002'], 'a.js');

  // completion review + report（out/<campaign-id>/report.md）。
  assertOk(
    cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'completion', '--verdict', 'pass']),
    'review completion'
  );
  assertOk(cliResult(root, ['report', 'campaign:c001'], []), 'report campaign');

  // --- gap 2: report が out/c001/report.md に出ること ---
  assert.ok(
    fs.existsSync(path.join(root, 'out', 'c001', 'report.md')),
    'report は out/c001/report.md へ出力されるべき'
  );

  // --- gap 1/2: 全 run accepted + 全 task 消化 + completion report で close 成立 ---
  const close = assertOk(cliResult(root, ['campaign', 'close', 'c001'], []), 'campaign close');
  assert.match(close.stdout, /closed/, `close は成功すべき: ${close.stdout}`);
  assert.equal(statusOf(root, 'campaign:c001'), 'closed', 'close 後 campaign は closed');

  // --- gap 6: campaign close で coverage spec が in-campaign -> done ---
  assert.equal(statusOf(root, 'spec:s001'), 'done', 'close 後 coverage spec は done');

  // gap 3/4: 私が journal へ写像した spec / campaign の refs は doctor の
  // frontmatter-refs / journal-refs 整合検査に反しないこと（{rel,to} 形で round-trip）。
  // 注: vision の approved-by:decision（decide 由来）は humans.js / doctor 側の
  // 既知の未整合であり P2 chain の対象外（最終報告 open question 参照）。ここでは
  // 私が担当する spec:s001 / campaign:c001 に起因する doctor error が無いことを確認する。
  const doc = cliResult(root, ['doctor']);
  const dj = JSON.parse(lastLine(doc.stdout));
  const mine = (dj.errors || []).filter(
    (e) => /spec:s001|campaign:c001/.test(e.detail) && /refs/.test(e.check)
  );
  assert.equal(
    mine.length,
    0,
    `spec:s001 / campaign:c001 の refs 整合 error は無いべき: ${JSON.stringify(mine)}`
  );
});

// ==================================================================
// gap 1: 未消化 task が残ると campaign close は拒否される
// ==================================================================
test('campaign close: 宣言 task の一部が未消化なら拒否（run.tasks 突き合わせ）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-chain-partial-'));
  initProject(root);
  initSrcRepo(root);
  buildActiveCampaign(root);

  // T001 のみ消化（T002 を残す）。
  runCampaignTasks(root, ['T001'], 'a.js');
  assertOk(
    cliResult(root, ['review', 'record', 'campaign:c001', '--gate', 'completion', '--verdict', 'pass']),
    'review completion'
  );
  assertOk(cliResult(root, ['report', 'campaign:c001'], []), 'report campaign');

  // 全 task チェック済ガードで拒否される（T002 未消化）。--json で拒否を stdout から読む。
  const close = cliResult(root, ['campaign', 'close', 'c001'], ['--json']);
  assert.equal(close.status, 2, `未消化 task があれば close は拒否: ${close.stdout}${close.stderr}`);
  const j = JSON.parse(lastLine(close.stdout));
  assert.equal(j.ok, false);
  assert.ok(
    j.missing.some((m) => m.input === 'tasks-done' && /T002/.test(m.detail)),
    `未消化 task T002 が列挙されるべき: ${JSON.stringify(j.missing)}`
  );
  assert.equal(statusOf(root, 'campaign:c001'), 'active', '拒否時 campaign は active のまま');
  assert.equal(statusOf(root, 'spec:s001'), 'in-campaign', '拒否時 coverage spec は in-campaign のまま');

  // 残りの T002 を消化 -> close 成立、spec done。
  runCampaignTasks(root, ['T002'], 'b.js');
  assertOk(cliResult(root, ['campaign', 'close', 'c001'], []), 'campaign close(全消化後)');
  assert.equal(statusOf(root, 'campaign:c001'), 'closed');
  assert.equal(statusOf(root, 'spec:s001'), 'done');
});

// ==================================================================
// 修正 1: campaign close で charter の Cross-Checks を CLI 実行する（04/13 の close 条件）
// ==================================================================

// (i) Cross-Checks が fail する check を持つと close は拒否される（Default-FAIL）。
test('campaign close: Cross-Checks の check が fail なら close は拒否（Default-FAIL）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-chain-xcheck-fail-'));
  const charter = charterWithCrossChecks(
    '- id: e2e ; run: "node -e \\"process.exit(1)\\"" ; cwd: src/api ; expect: { exit: 0 }'
  );
  readyToClose(root, charter);

  const close = cliResult(root, ['campaign', 'close', 'c001'], ['--json']);
  assert.equal(close.status, 2, `Cross-Checks fail 時 close は拒否されるべき: ${close.stdout}${close.stderr}`);
  const j = JSON.parse(lastLine(close.stdout));
  assert.equal(j.ok, false);
  assert.ok(
    j.missing.some((m) => m.input === 'cross-check:e2e' && /fail/.test(m.detail)),
    `fail した cross-check:e2e が列挙されるべき: ${JSON.stringify(j.missing)}`
  );
  assert.equal(statusOf(root, 'campaign:c001'), 'active', '拒否時 campaign は active のまま');
});

// (ii) Cross-Checks が全 pass なら close が成立し guard_results に焼き込まれる。
test('campaign close: Cross-Checks 全 pass で close 成立し guard_results に焼き込まれる', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-chain-xcheck-pass-'));
  const charter = charterWithCrossChecks(
    `- id: e2e ; run: "${OK_CHECK}" ; cwd: src/api ; expect: { exit: 0 }`
  );
  readyToClose(root, charter);

  const close = assertOk(cliResult(root, ['campaign', 'close', 'c001'], []), 'campaign close');
  assert.match(close.stdout, /closed/, `Cross-Checks 全 pass で close 成立すべき: ${close.stdout}`);
  assert.equal(statusOf(root, 'campaign:c001'), 'closed');

  // transitioned event の guard_results に cross-check:e2e（pass, exit=0）が焼き込まれること。
  const journalDir = path.join(root, 'journal');
  const events = fs
    .readdirSync(journalDir)
    .map((f) => JSON.parse(fs.readFileSync(path.join(journalDir, f), 'utf8')));
  const closeEv = events.find(
    (e) => e.type === 'transitioned' && e.subject === 'campaign:c001' && e.data && e.data.to === 'closed'
  );
  assert.ok(closeEv, 'campaign close の transitioned event が存在すべき');
  const gr = (closeEv.data.guard_results || []).find((g) => g.name === 'cross-check:e2e');
  assert.ok(gr, `guard_results に cross-check:e2e があるべき: ${JSON.stringify(closeEv.data.guard_results)}`);
  assert.equal(gr.pass, true, 'cross-check:e2e は pass で焼き込まれるべき');
  assert.match(gr.detail, /exit=0/, `detail に exit code が含まれるべき: ${gr.detail}`);
});

// (iii) Cross-Checks 節が無い（check 0 件）charter は従来どおり close 可（vacuous pass）。
test('campaign close: Cross-Checks に check が無ければ従来どおり close 可（vacuous pass）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-chain-xcheck-none-'));
  // 既定 CHARTER_BODY の Cross-Checks は平文（id:/run: 無し）なので check 0 件。
  readyToClose(root, CHARTER_BODY);

  const close = assertOk(cliResult(root, ['campaign', 'close', 'c001'], []), 'campaign close');
  assert.match(close.stdout, /closed/, `check 0 件の charter は close 可: ${close.stdout}`);
  assert.equal(statusOf(root, 'campaign:c001'), 'closed');
});

// ==================================================================
// gap 1(claim) + 05 7 章: 同一 task の二重 claim は拒否
// ==================================================================
test('campaign 由来 run: 未終端 run が claim 済みの task は二重 claim を拒否', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-chain-claim-'));
  initProject(root);
  initSrcRepo(root);
  buildActiveCampaign(root);

  // T001 を claim する run を open（未終端のまま保持）。
  const opened = assertOk(cliResult(root, ['run', 'open', 'c001', '--tasks', 'T001'], []), 'run open first');
  const runId = lastLine(opened.stdout);
  assert.equal(statusOf(root, `run:${runId}`), 'handed-off');

  // 同一 task T001 を対象とする後続 run open は claim 済みで拒否される（--json で拒否を読む）。
  const dup = cliResult(root, ['run', 'open', 'c001', '--tasks', 'T001'], ['--json']);
  assert.equal(dup.status, 2, `二重 claim は拒否されるべき: ${dup.stdout}${dup.stderr}`);
  const j = JSON.parse(lastLine(dup.stdout));
  assert.ok(
    j.missing.some((m) => m.input === 'claim'),
    `claim 拒否が列挙されるべき: ${JSON.stringify(j.missing)}`
  );
});
