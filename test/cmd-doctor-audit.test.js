import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run as initRun } from '../lib/commands/init.js';
import { run as doctorRun } from '../lib/commands/doctor.js';
import { append } from '../lib/journal.js';
import { write } from '../lib/writePath.js';
import { contentHash, sha256 } from '../lib/hash.js';

// P4 監査強化（doctor 検査の拡充）テスト。
// 検証対象: evidence-hash / decision-unit / guard-recalc（再計算）/ ulid-order / evidence-files /
//           event-schema の各新検査。
// 方針: init で最小 green project を作り、そこへ schema-valid な event と実 evidence ファイルを
//       決定論的に足す/改変して各 finding が発火する/しないことを assert する。
// 一時ディレクトリを --root にし、repo 直下を project-context にしない（共通厳守事項）。

function tmpRoot(label) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), `cc-audit-${label}-`));
  return path.join(base, 'proj');
}

function silentInit(target) {
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    initRun({ positional: [target], flags: {}, jsonMode: true });
  } finally {
    process.stdout.write = origWrite;
  }
}

// stdout / process.exitCode を捕捉して doctor を JSON モードで実行する。
function runDoctor(root) {
  const chunks = [];
  const origWrite = process.stdout.write;
  const origExit = process.exitCode;
  process.exitCode = 0;
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  try {
    doctorRun({ root, jsonMode: true });
  } finally {
    process.stdout.write = origWrite;
  }
  const out = chunks.join('');
  const exitCode = process.exitCode;
  process.exitCode = origExit || 0;
  const json = JSON.parse(out.trim().split('\n').pop());
  return { json, exitCode };
}

// finding の中から check 名で拾う（errors / warnings いずれからも）。
function findingsOf(json, check) {
  return [...json.errors, ...json.warnings].filter((f) => f.check === check);
}

// 順序が意味を持つ event 列を、単調増加 ULID を手で割り当てて journal に直接書く。
// append() は clock 由来 ULID を使うため同一 ms 内で順序が揺れ得る（実行系は
// waitNextMillis で単調性を保証する）。テストの決定論のため、ここでは連番 ULID を
// 明示付与し「時点 snapshot 再構成」が期待どおりの前後関係になることを保証する。
function makeSeqAppend(root) {
  let n = 0;
  return function seqAppend(event) {
    n += 1;
    const id = '01SEQ' + String(n).padStart(21, '0'); // 26 桁・辞書順で単調増加。
    const record = {
      id,
      ts: new Date(2026, 0, 1, 0, 0, n).toISOString(), // n 秒刻みで ULID 昇順と ts を一致させる。
      actor: event.actor,
      type: event.type,
      subject: event.subject,
    };
    if (event.data !== undefined) record.data = event.data;
    if (event.payload !== undefined) record.payload = event.payload;
    if (event.refs !== undefined) record.refs = event.refs;
    fs.writeFileSync(path.join(root, 'journal', `${id}.json`), JSON.stringify(record, null, 2) + '\n');
    return id;
  };
}

// spec 本文（frontmatter + 必須セクション）を specs/<id>-<slug>/spec.md に置く。
function placeSpec(root, id, body) {
  const dir = path.join(root, 'specs', `${id}-x`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'spec.md'), body);
  return path.join(dir, 'spec.md');
}

const SPEC_BODY = `---
id: s001
refs: []
---
# spec
## Requirements
r
## Acceptance
a
## Surfaces
s
## Checks
- id: c1
  run: node -e "process.exit(0)"
`;

// ---- evidence-hash 検査 ----

test('evidence-hash: review payload が対象本文の現 content-hash と一致すれば warn なし', () => {
  const root = tmpRoot('evh-ok');
  silentInit(root);
  const specPath = placeSpec(root, 's001', SPEC_BODY);
  const hash = contentHash(fs.readFileSync(specPath, 'utf8'));
  const recRel = path.join('evidence', 'reviews', 'spec_s001.spec.json');
  write(root, recRel, JSON.stringify({ ref: 'spec:s001', gate: 'spec', verdict: 'pass', sha256: hash }) + '\n');
  append(root, {
    type: 'review.recorded',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    data: { gate: 'spec', verdict: 'pass' },
    payload: { path: recRel, sha256: hash },
    refs: [{ rel: 'reviews', to: 'spec:s001' }],
  });

  const { json } = runDoctor(root);
  assert.equal(findingsOf(json, 'evidence-hash').length, 0, JSON.stringify(json.warnings));
});

test('evidence-hash: 本文が編集され content-hash がずれると stale warn（error ではない）', () => {
  const root = tmpRoot('evh-stale');
  silentInit(root);
  const specPath = placeSpec(root, 's001', SPEC_BODY);
  const staleHash = contentHash(fs.readFileSync(specPath, 'utf8'));
  const recRel = path.join('evidence', 'reviews', 'spec_s001.spec.json');
  write(root, recRel, JSON.stringify({ ref: 'spec:s001', gate: 'spec', verdict: 'pass', sha256: staleHash }) + '\n');
  append(root, {
    type: 'review.recorded',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    data: { gate: 'spec', verdict: 'pass' },
    payload: { path: recRel, sha256: staleHash },
  });
  // review 後に本文を編集 -> content-hash がずれる。
  fs.writeFileSync(specPath, SPEC_BODY + '\n追記により stale 化。\n');

  const { json, exitCode } = runDoctor(root);
  const evh = findingsOf(json, 'evidence-hash');
  assert.equal(evh.length, 1);
  assert.equal(evh[0].severity, 'warn');
  assert.equal(exitCode, 0, 'stale は warn なので green を崩さない');
});

test('evidence-hash: review が指す対象成果物が消失すると error', () => {
  const root = tmpRoot('evh-missing-target');
  silentInit(root);
  // spec 本文を置かないまま review event を足す。
  const recRel = path.join('evidence', 'reviews', 'spec_s001.spec.json');
  write(root, recRel, JSON.stringify({ ref: 'spec:s001', gate: 'spec', verdict: 'pass', sha256: 'deadbeef' }) + '\n');
  append(root, {
    type: 'review.recorded',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    data: { gate: 'spec', verdict: 'pass' },
    payload: { path: recRel, sha256: 'deadbeef' },
  });

  const { json, exitCode } = runDoctor(root);
  const evh = findingsOf(json, 'evidence-hash').filter((f) => f.severity === 'error');
  assert.equal(evh.length, 1);
  assert.equal(exitCode, 1);
});

test('evidence-hash: verify verdict.json の sha256 が payload と一致すれば error なし / 改変で error', () => {
  const root = tmpRoot('evh-verify');
  silentInit(root);
  const runId = 'r-abc-demo';
  const verdict = { runId, pass: true, checks: [], surface: { offSurface: [], forbidden: [] } };
  const verdictRel = path.join('evidence', 'verifications', runId, 'verdict.json');
  write(root, verdictRel, JSON.stringify(verdict, null, 2) + '\n');
  const payloadSha = sha256(JSON.stringify(verdict));
  append(root, {
    type: 'verify.recorded',
    subject: `run:${runId}`,
    actor: { kind: 'cli' },
    data: { pass: true, checks: [], surface: verdict.surface },
    payload: { path: verdictRel, sha256: payloadSha },
  });

  // 一致ケース: error なし。
  let res = runDoctor(root);
  assert.equal(findingsOf(res.json, 'evidence-hash').filter((f) => f.severity === 'error').length, 0);

  // verdict.json を改変 -> sha256 不一致 -> error。
  const tampered = { ...verdict, pass: false };
  write(root, verdictRel, JSON.stringify(tampered, null, 2) + '\n');
  res = runDoctor(root);
  const evh = findingsOf(res.json, 'evidence-hash').filter((f) => f.severity === 'error');
  assert.equal(evh.length, 1);
  assert.equal(res.exitCode, 1);
});

// ---- decision-unit 充足検査 ----

test('decision-unit: verification 先行なしの run accepted 遷移は証拠なし遷移 error', () => {
  const root = tmpRoot('du-noverify');
  silentInit(root);
  const runId = 'r-xyz-noev';
  const subject = `run:${runId}`;
  // created -> verified -> accepted を verify.recorded 無しで焼く（改竄ドリフト相当）。
  append(root, { type: 'created', subject, actor: { kind: 'cli' }, data: { type: 'normal' } });
  append(root, {
    type: 'transitioned',
    subject,
    actor: { kind: 'cli' },
    data: { from: 'created', to: 'verified', guard_results: [{ name: 'run-state', pass: true, detail: 'x' }] },
  });
  append(root, {
    type: 'transitioned',
    subject,
    actor: { kind: 'cli' },
    data: {
      from: 'verified',
      to: 'accepted',
      guard_results: [
        { name: 'run-state', pass: true, detail: 'x' },
        { name: 'blocking-gap', pass: true, detail: 'ok' },
      ],
    },
  });

  const { json, exitCode } = runDoctor(root);
  const du = findingsOf(json, 'decision-unit').filter((f) => f.detail.includes('verification'));
  assert.equal(du.length, 1, JSON.stringify(json.errors));
  assert.equal(du[0].severity, 'error');
  assert.equal(exitCode, 1);
});

test('decision-unit: verification(pass) が先行する run accepted は証拠あり（decision-unit error なし）', () => {
  const root = tmpRoot('du-ok');
  silentInit(root);
  const seqAppend = makeSeqAppend(root);
  const runId = 'r-ok-run';
  const subject = `run:${runId}`;
  seqAppend({ type: 'created', subject, actor: { kind: 'cli' }, data: { type: 'normal' } });
  seqAppend({
    type: 'transitioned',
    subject,
    actor: { kind: 'cli' },
    data: { from: 'created', to: 'verified', guard_results: [{ name: 'run-state', pass: true, detail: 'x' }] },
  });
  // 実 evidence を伴う verify.recorded（accepted 遷移より前に置く）。
  const verdict = { runId, pass: true, checks: [], surface: { offSurface: [], forbidden: [] } };
  const verdictRel = path.join('evidence', 'verifications', runId, 'verdict.json');
  write(root, verdictRel, JSON.stringify(verdict, null, 2) + '\n');
  seqAppend({
    type: 'verify.recorded',
    subject,
    actor: { kind: 'cli' },
    data: { pass: true },
    payload: { path: verdictRel, sha256: sha256(JSON.stringify(verdict)) },
  });
  // run gate=required（init 既定）のため gate=run の review record も先行させる。
  const notesRel = path.join('runs', runId, 'notes.md');
  write(root, notesRel, '# notes\nrun メモ本文。\n');
  const notesHash = contentHash(fs.readFileSync(path.join(root, notesRel), 'utf8'));
  const runRecRel = path.join('evidence', 'reviews', `run_${runId}.run.json`);
  write(root, runRecRel, JSON.stringify({ ref: subject, gate: 'run', verdict: 'pass', sha256: notesHash }) + '\n');
  seqAppend({
    type: 'review.recorded',
    subject,
    actor: { kind: 'agent' },
    data: { gate: 'run', verdict: 'pass' },
    payload: { path: runRecRel, sha256: notesHash },
  });
  seqAppend({
    type: 'transitioned',
    subject,
    actor: { kind: 'cli' },
    data: {
      from: 'verified',
      to: 'accepted',
      guard_results: [
        { name: 'verification', pass: true, detail: 'pass' },
        { name: 'blocking-gap', pass: true, detail: 'ok' },
      ],
    },
  });

  const { json } = runDoctor(root);
  assert.equal(findingsOf(json, 'decision-unit').length, 0, JSON.stringify(json.errors));
});

test('decision-unit: review record なしの spec ready 遷移は証拠なし遷移 error', () => {
  const root = tmpRoot('du-spec');
  silentInit(root);
  placeSpec(root, 's001', SPEC_BODY);
  append(root, { type: 'created', subject: 'spec:s001', actor: { kind: 'agent' } });
  append(root, {
    type: 'transitioned',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    data: { from: 'draft', to: 'ready', guard_results: [{ name: 'spec-sections', pass: true, detail: 'x' }] },
  });

  const { json } = runDoctor(root);
  const du = findingsOf(json, 'decision-unit').filter((f) => f.detail.includes('gate=spec'));
  assert.equal(du.length, 1, JSON.stringify(json.errors));
  assert.equal(du[0].severity, 'error');
});

test('decision-unit: decision.recorded の actor が human でなければ error', () => {
  const root = tmpRoot('du-actor');
  silentInit(root);
  append(root, {
    type: 'decision.recorded',
    subject: 'decision:d001',
    actor: { kind: 'agent' }, // human でない = 決定単位の主体要件違反。
    data: {},
  });

  const { json, exitCode } = runDoctor(root);
  const du = findingsOf(json, 'decision-unit').filter((f) => f.detail.includes('actor'));
  assert.equal(du.length, 1);
  assert.equal(du[0].severity, 'error');
  assert.equal(exitCode, 1);
});

// ---- guard-recalc（再計算照合） ----

test('guard-recalc: blocking-gap を pass 記録だが時点に open blocking gap があれば再計算不一致 error', () => {
  const root = tmpRoot('gr-mismatch');
  silentInit(root);
  const seqAppend = makeSeqAppend(root);
  const specPath = placeSpec(root, 's001', SPEC_BODY);
  seqAppend({ type: 'created', subject: 'spec:s001', actor: { kind: 'agent' } });
  // spec:s001 を対象とする open blocking gap を先に開く。
  seqAppend({
    type: 'gap.opened',
    subject: 'gap:g001',
    actor: { kind: 'agent' },
    data: { kind: 'ambiguity', blocking: true, target: 'spec:s001' },
  });
  // review record も足しておき decision-unit 側の error と分離する。
  const hash = contentHash(fs.readFileSync(specPath, 'utf8'));
  const recRel = path.join('evidence', 'reviews', 'spec_s001.spec.json');
  write(root, recRel, JSON.stringify({ ref: 'spec:s001', gate: 'spec', verdict: 'pass', sha256: hash }) + '\n');
  seqAppend({
    type: 'review.recorded',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    data: { gate: 'spec', verdict: 'pass' },
    payload: { path: recRel, sha256: hash },
  });
  // その後 no-blocking-gap を pass=true と偽って ready 遷移を焼く（本来止まるはず）。
  seqAppend({
    type: 'transitioned',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    data: {
      from: 'draft',
      to: 'ready',
      guard_results: [{ name: 'no-blocking-gap', pass: true, detail: '偽った pass' }],
    },
  });

  const { json, exitCode } = runDoctor(root);
  const gr = findingsOf(json, 'guard-recalc').filter((f) => f.detail.includes('再計算不一致'));
  assert.equal(gr.length, 1, JSON.stringify(json.errors));
  assert.equal(gr[0].severity, 'error');
  assert.equal(exitCode, 1);
});

test('guard-recalc: 記録に fail が焼かれていれば従来どおり error', () => {
  const root = tmpRoot('gr-fail');
  silentInit(root);
  append(root, { type: 'created', subject: 'spec:s009', actor: { kind: 'agent' } });
  append(root, {
    type: 'transitioned',
    subject: 'spec:s009',
    actor: { kind: 'agent' },
    data: { from: 'draft', to: 'ready', guard_results: [{ name: 'spec-sections', pass: false, detail: 'fail' }] },
  });

  const { json } = runDoctor(root);
  assert.ok(findingsOf(json, 'guard-recalc').some((f) => f.detail.includes('fail')));
});

// ---- ULID 時系列整合 ----

test('ulid-order: ファイル名と event.id が食い違うと warn', () => {
  const root = tmpRoot('ulid-name');
  silentInit(root);
  const id = append(root, { type: 'note.appended', subject: 'run:r1', actor: { kind: 'agent' }, data: {} });
  // event ファイルを別名にリネーム（ファイル名 != event.id）。
  const jdir = path.join(root, 'journal');
  fs.renameSync(path.join(jdir, `${id}.json`), path.join(jdir, `${id}_renamed.json`));

  const { json, exitCode } = runDoctor(root);
  const uo = findingsOf(json, 'ulid-order');
  assert.ok(uo.some((f) => f.detail.includes('ファイル名')), JSON.stringify(json.warnings));
  assert.ok(uo.every((f) => f.severity === 'warn'));
  assert.equal(exitCode, 0, 'ULID 逆転/不一致は warn なので green を崩さない');
});

test('ulid-order: ULID 昇順に対し ts が逆行すると warn', () => {
  const root = tmpRoot('ulid-ts');
  silentInit(root);
  // ts が過去に逆行する event を、より大きい ULID ファイル名で直接書く。
  const jdir = path.join(root, 'journal');
  const bigId = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZ';
  const ev = {
    id: bigId,
    ts: '2000-01-01T00:00:00.000Z', // 明らかに過去。
    actor: { kind: 'agent' },
    type: 'note.appended',
    subject: 'run:r1',
    data: {},
  };
  fs.writeFileSync(path.join(jdir, `${bigId}.json`), JSON.stringify(ev, null, 2) + '\n');

  const { json } = runDoctor(root);
  const uo = findingsOf(json, 'ulid-order').filter((f) => f.detail.includes('逆行'));
  assert.equal(uo.length, 1, JSON.stringify(json.warnings));
  assert.equal(uo[0].severity, 'warn');
});

// ---- 孤立 evidence 突合 ----

test('evidence-files: 対応 journal event の無い verdict.json は孤立 warn', () => {
  const root = tmpRoot('orphan-verdict');
  silentInit(root);
  const runId = 'r-orphan';
  const verdict = { runId, pass: true, checks: [], surface: { offSurface: [], forbidden: [] } };
  write(
    root,
    path.join('evidence', 'verifications', runId, 'verdict.json'),
    JSON.stringify(verdict, null, 2) + '\n'
  );
  // verify.recorded を足さない -> 孤立。

  const { json, exitCode } = runDoctor(root);
  const ef = findingsOf(json, 'evidence-files').filter((f) => f.detail.includes('孤立'));
  assert.equal(ef.length, 1, JSON.stringify(json.warnings));
  assert.equal(ef[0].severity, 'warn');
  assert.equal(exitCode, 0, '孤立 evidence は warn');
});

test('evidence-files: 孤立 review record も warn', () => {
  const root = tmpRoot('orphan-review');
  silentInit(root);
  write(
    root,
    path.join('evidence', 'reviews', 'spec_s001.spec.json'),
    JSON.stringify({ ref: 'spec:s001', gate: 'spec', verdict: 'pass', sha256: 'x' }) + '\n'
  );

  const { json } = runDoctor(root);
  assert.ok(findingsOf(json, 'evidence-files').some((f) => f.detail.includes('孤立')));
});

// ---- event-schema ----

test('event-schema: payload.sha256 を欠く event は schema error', () => {
  const root = tmpRoot('schema');
  silentInit(root);
  // 壊れた event を直接書く（append は付与するため素通りしない構造を作る）。
  const jdir = path.join(root, 'journal');
  const badId = '01BADSCHEMA0000000000000000';
  fs.writeFileSync(
    path.join(jdir, `${badId}.json`),
    JSON.stringify({
      id: badId,
      ts: new Date().toISOString(),
      actor: { kind: 'agent' },
      type: 'review.recorded',
      subject: 'spec:s001',
      payload: { path: 'evidence/reviews/x.json' }, // sha256 欠落。
    }) + '\n'
  );

  const { json, exitCode } = runDoctor(root);
  const es = findingsOf(json, 'event-schema').filter((f) => f.detail.includes('sha256'));
  assert.equal(es.length, 1, JSON.stringify(json.errors));
  assert.equal(exitCode, 1);
});

// ---- init 直後の green 維持（新検査で false-positive を出さない） ----

test('init 直後の doctor は新検査を足しても green のまま', () => {
  const root = tmpRoot('still-green');
  silentInit(root);
  const { json, exitCode } = runDoctor(root);
  assert.equal(json.green, true, JSON.stringify(json.errors));
  assert.equal(exitCode, 0);
});
