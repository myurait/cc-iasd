import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from '../lib/commands/run.js';
import { readAll, append } from '../lib/journal.js';
import { derive } from '../lib/state.js';
import { initProjectContext } from '../lib/gitops.js';
import { write } from '../lib/writePath.js';
import { contentHash } from '../lib/hash.js';

// --- test harness ---
// cmd-run.test.js と同じ最小 project-context を組む。

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-json-'));
  initProjectContext(root);
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  write(root, 'cc-iasd.yaml', 'doc_lang: Japanese\n');
  write(root, path.join('roles', 'worker.md'), '# worker\nhandoff を入力に src/ のみ編集する。\n');
  return root;
}

function snap(root) {
  return derive(readAll(root));
}

// stdout を捕捉し、単一 JSON としてパースして返すヘルパ。
// jsonMode:true の run 系出力が「改行 1 個で終わる単一 JSON 行のみ」であることを
// パース前に検査する（人間可読テキスト混在の退行を検出する）。
async function captureJson(fn) {
  const orig = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  let ret;
  try {
    ret = await fn();
  } finally {
    process.stdout.write = orig;
  }
  const trimmed = out.replace(/\n$/, '');
  // 単一行であること（テキスト前置き・複数オブジェクトの禁止）。
  assert.equal(trimmed.split('\n').length, 1, `単一 JSON 行のみのはず: ${JSON.stringify(out)}`);
  const obj = JSON.parse(trimmed);
  return { obj, ret };
}

// adhoc run を open して runId を返す（jsonMode:true 経路）。
function openAdhoc(root, goal, check) {
  return captureJson(() =>
    run({ positional: ['open'], flags: { adhoc: goal, check }, root, jsonMode: true })
  );
}

// --- run open --json ---

test('run open --json: 単一 JSON { ok, command, run }', async () => {
  const root = tmpRoot();
  const { obj, ret } = await openAdhoc(root, 'JSON 出力の検証', 'node -e "process.exit(0)"');
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'run open');
  assert.match(obj.run, /^r-[0-9A-Z]{26}-/);
  // 返り値（既存テスト互換）は runId 文字列のまま。
  assert.equal(ret, obj.run);
});

// --- run handoff --json ---

test('run handoff --json: { ok, command, run, handoff } に本文を内包', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, 'ログイン修正', 'node -e "process.exit(0)"');
  const runId = opened.run;

  const { obj, ret } = await captureJson(() =>
    run({ positional: ['handoff', runId], flags: {}, root, jsonMode: true })
  );
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'run handoff');
  assert.equal(obj.run, runId);
  // handoff 本文（markdown 全文）を内包し、handoff.md の中身と一致する。
  assert.equal(typeof obj.handoff, 'string');
  assert.match(obj.handoff, /# handoff:/);
  assert.match(obj.handoff, /ログイン修正/);
  const md = fs.readFileSync(path.join(root, 'runs', runId, 'handoff.md'), 'utf8');
  assert.equal(obj.handoff, md);
  // 返り値は markdown 本文のまま（stdout 正本経路の互換）。
  assert.equal(ret, md);
});

// --- run return --json ---

test('run return --json: { ok, command, run, to }', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, '差戻し検証', 'node -e "process.exit(0)"');
  const runId = opened.run;
  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\n作業した。\n');

  const { obj } = await captureJson(() =>
    run({ positional: ['return', runId], flags: {}, root, jsonMode: true })
  );
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'run return');
  assert.equal(obj.run, runId);
  assert.equal(obj.to, 'returned');
  assert.equal(snap(root).runs[runId].status, 'returned');
});

// --- run verify --json ---

test('run verify --json: { ok, command, run, pass, checks, surface }', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, '検証出力', 'node -e "process.exit(0)"');
  const runId = opened.run;
  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\nx\n');
  await captureJson(() =>
    run({ positional: ['return', runId], flags: {}, root, jsonMode: true })
  );

  const { obj, ret } = await captureJson(() =>
    run({ positional: ['verify', runId], flags: {}, root, jsonMode: true })
  );
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'run verify');
  assert.equal(obj.run, runId);
  assert.equal(obj.pass, true);
  assert.ok(Array.isArray(obj.checks));
  assert.ok(obj.surface && Array.isArray(obj.surface.offSurface));
  // 理由型: pass 時は failureReasons=[]、checks 各要素に reason が載る。
  assert.deepEqual(obj.failureReasons, []);
  assert.equal(obj.checks[0].reason, 'passed');
  // 返り値の pass は従来通り。
  assert.equal(ret.pass, true);
});

test('run verify --json: fail 時に failureReasons と checks[].reason を露出', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, '検証失敗出力', 'node -e "process.exit(1)"');
  const runId = opened.run;
  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\nx\n');
  await captureJson(() =>
    run({ positional: ['return', runId], flags: {}, root, jsonMode: true })
  );

  const { obj } = await captureJson(() =>
    run({ positional: ['verify', runId], flags: {}, root, jsonMode: true })
  );
  assert.equal(obj.pass, false);
  // exit 不一致 = refuted。
  assert.deepEqual(obj.failureReasons, ['refuted']);
  assert.equal(obj.checks[0].reason, 'refuted');
});

// --- run accept --json ---

test('run accept --json: { ok, command, run, to }', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, '受理検証', 'node -e "process.exit(0)"');
  const runId = opened.run;
  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\nx\n');
  await captureJson(() =>
    run({ positional: ['return', runId], flags: {}, root, jsonMode: true })
  );
  await captureJson(() =>
    run({ positional: ['verify', runId], flags: {}, root, jsonMode: true })
  );
  // gate=run（既定 required）の review record を notes の content-hash で記録する。
  const notes = fs.readFileSync(path.join(root, 'runs', runId, 'notes.md'), 'utf8');
  append(root, {
    type: 'review.recorded',
    subject: `run:${runId}`,
    actor: { kind: 'agent' },
    data: { gate: 'run' },
    payload: { path: `runs/${runId}/notes.md`, sha256: contentHash(notes) },
  });

  const { obj, ret } = await captureJson(() =>
    run({ positional: ['accept', runId], flags: {}, root, jsonMode: true })
  );
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'run accept');
  assert.equal(obj.run, runId);
  assert.equal(obj.to, 'accepted');
  assert.equal(ret, runId);
  assert.equal(snap(root).runs[runId].status, 'accepted');
});

test('verify fail 後の accept 封鎖は verification detail に理由型を載せる', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, '受理封鎖検証', 'node -e "process.exit(1)"');
  const runId = opened.run;
  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\nx\n');
  await captureJson(() =>
    run({ positional: ['return', runId], flags: {}, root, jsonMode: true })
  );
  // verify は pass=false（refuted）だが状態は verified へ遷移する。
  const { obj: v } = await captureJson(() =>
    run({ positional: ['verify', runId], flags: {}, root, jsonMode: true })
  );
  assert.equal(v.pass, false);
  assert.equal(snap(root).runs[runId].status, 'verified');

  // accept は verification pass=false で封鎖され、detail に reasons=refuted を含む。
  await assert.rejects(
    () => run({ positional: ['accept', runId], flags: {}, root, jsonMode: true }),
    (err) => {
      assert.ok(err.isRefusal, 'Refusal であること');
      const vg = err.missing.find((m) => m.input === 'verification');
      assert.ok(vg, 'verification ガードの欠落があること');
      assert.match(vg.detail, /reasons=refuted/);
      return true;
    }
  );
});

// --- run block --json ---

test('run block --json: { ok, command, run, to, missing }', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, '差戻し', 'node -e "process.exit(0)"');
  const runId = opened.run;

  const { obj } = await captureJson(() =>
    run({ positional: ['block', runId], flags: { missing: 'spec:s001' }, root, jsonMode: true })
  );
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'run block');
  assert.equal(obj.run, runId);
  assert.equal(obj.to, 'blocked');
  assert.equal(obj.missing, 'spec:s001');
  assert.equal(snap(root).runs[runId].status, 'blocked');
});

// --- run escalate --json ---

test('run escalate --json: { ok, command, run, to, reason }', async () => {
  const root = tmpRoot();
  const { obj: opened } = await openAdhoc(root, '打上げ', 'node -e "process.exit(0)"');
  const runId = opened.run;

  const { obj } = await captureJson(() =>
    run({
      positional: ['escalate', runId],
      flags: { reason: '人間判断が要る' },
      root,
      jsonMode: true,
    })
  );
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'run escalate');
  assert.equal(obj.run, runId);
  assert.equal(obj.to, 'escalated');
  assert.equal(obj.reason, '人間判断が要る');
  assert.equal(snap(root).runs[runId].status, 'escalated');
});

// --- refuse 経路の --json（dispatcher が emitRefusal で { ok:false } を出す前提） ---
// run 系サブコマンド固有の refuse は Refusal を throw する。ライブラリ層の
// toJSON() 形状が run 系でも成立することを確認する（exit 2 は dispatcher の責務）。

test('run 系の Refusal.toJSON は { ok:false, command, missing, next }', async () => {
  const root = tmpRoot();
  // notes 不在のまま return -> notes ガードで refuse。
  const { obj: opened } = await openAdhoc(root, '拒否検証', 'node -e "process.exit(0)"');
  const runId = opened.run;
  await assert.rejects(
    () => run({ positional: ['return', runId], flags: {}, root, jsonMode: true }),
    (e) => {
      assert.equal(e.isRefusal, true);
      const j = e.toJSON();
      assert.equal(j.ok, false);
      assert.equal(typeof j.command, 'string');
      assert.ok(Array.isArray(j.missing));
      assert.ok(Array.isArray(j.next));
      return true;
    }
  );
});

// --- 全 run 系サブコマンドが単一 JSON を出すことの総括（回帰ガード） ---

test('run 系 7 サブコマンドの --json はすべて ok と主要キーを持つ単一 JSON', async () => {
  const root = tmpRoot();

  // open / handoff / return / verify / accept を 1 本の run で通す。
  const { obj: o } = await openAdhoc(root, '総括', 'node -e "process.exit(0)"');
  const rid = o.run;
  assert.equal(o.ok, true);

  const { obj: h } = await captureJson(() =>
    run({ positional: ['handoff', rid], flags: {}, root, jsonMode: true })
  );
  assert.equal(h.ok, true);
  assert.ok('handoff' in h);

  write(root, path.join('runs', rid, 'notes.md'), '## 実装メモ\nx\n');
  const { obj: r } = await captureJson(() =>
    run({ positional: ['return', rid], flags: {}, root, jsonMode: true })
  );
  assert.equal(r.ok, true);

  const { obj: v } = await captureJson(() =>
    run({ positional: ['verify', rid], flags: {}, root, jsonMode: true })
  );
  assert.equal(v.ok, true);
  assert.ok('pass' in v);

  const notes = fs.readFileSync(path.join(root, 'runs', rid, 'notes.md'), 'utf8');
  append(root, {
    type: 'review.recorded',
    subject: `run:${rid}`,
    actor: { kind: 'agent' },
    data: { gate: 'run' },
    payload: { path: `runs/${rid}/notes.md`, sha256: contentHash(notes) },
  });
  const { obj: a } = await captureJson(() =>
    run({ positional: ['accept', rid], flags: {}, root, jsonMode: true })
  );
  assert.equal(a.ok, true);
  assert.equal(a.to, 'accepted');

  // block / escalate はそれぞれ別 run で（終端遷移のため）。
  const { obj: ob } = await openAdhoc(root, 'ブロック用', 'node -e "process.exit(0)"');
  const { obj: b } = await captureJson(() =>
    run({ positional: ['block', ob.run], flags: { missing: 'spec:x' }, root, jsonMode: true })
  );
  assert.equal(b.ok, true);
  assert.equal(b.to, 'blocked');

  const { obj: oe } = await openAdhoc(root, 'エスカレ用', 'node -e "process.exit(0)"');
  const { obj: e } = await captureJson(() =>
    run({ positional: ['escalate', oe.run], flags: {}, root, jsonMode: true })
  );
  assert.equal(e.ok, true);
  assert.equal(e.to, 'escalated');

  // 全 7 サブコマンドが ok:true かつ run を持つ。
  for (const [name, obj] of [
    ['open', o],
    ['handoff', h],
    ['return', r],
    ['verify', v],
    ['accept', a],
    ['block', b],
    ['escalate', e],
  ]) {
    assert.equal(obj.ok, true, `${name}: ok が true でない`);
    assert.equal(typeof obj.command, 'string', `${name}: command 欠落`);
    assert.equal(typeof obj.run, 'string', `${name}: run 欠落`);
  }
});
