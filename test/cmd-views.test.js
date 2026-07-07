import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run as views } from '../lib/commands/views.js';
import { append, readAll } from '../lib/journal.js';
import { write } from '../lib/writePath.js';

// --- テスト用 project-context を tmp に scaffold する ---
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-iasd-views-'));
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  return root;
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// append は Date.now() 由来の ULID を付すため、同一ミリ秒内の連続 append は
// ULID の乱数部で順序が揺れる（derive は id 昇順で畳み込むため created の後に
// transitioned を確実に置きたい）。テストでは順序を固定するため、単調増加の
// id を明示して event file を直接書く（core-state.test.js と同じ方式）。
let seqCounter = 0;
function put(root, subject, type, extra = {}) {
  seqCounter += 1;
  const rec = {
    id: String(seqCounter).padStart(26, '0'),
    ts: new Date().toISOString(),
    actor: extra.actor || { kind: 'cli' },
    type,
    subject,
  };
  if (extra.data !== undefined) rec.data = extra.data;
  if (extra.payload !== undefined) rec.payload = extra.payload;
  if (extra.refs !== undefined) rec.refs = extra.refs;
  if (extra.ts) rec.ts = extra.ts;
  write(root, path.join('journal', `${rec.id}.json`), JSON.stringify(rec, null, 2) + '\n');
  return rec.id;
}

// stdout を捕捉しつつハンドラを呼ぶ（副作用の stdout はテスト対象外にする）。
async function call(command, opts) {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  let result;
  try {
    result = await views({ command, positional: [], flags: {}, root: null, jsonMode: true, ...opts });
  } finally {
    process.stdout.write = orig;
  }
  return { result, stdout: chunks.join('') };
}

// roles/ に card を置く。
function seedRole(root, name, body) {
  write(root, path.join('roles', `${name}.md`), body);
}

// --- role show ---------------------------------------------------------

test('role show planner は card を出力し {{docLang}} を置換する', async () => {
  const root = makeRoot();
  try {
    seedRole(root, 'planner', '# planner\n出力言語は {{docLang}} で書く。\n');
    const { result } = await call('role', { positional: ['show', 'planner'], root, jsonMode: true });
    assert.equal(result.ok, true);
    assert.equal(result.role, 'planner');
    assert.match(result.card, /出力言語は Japanese で書く/);
    assert.doesNotMatch(result.card, /\{\{docLang\}\}/);
  } finally {
    cleanup(root);
  }
});

test('role show の不正な role は拒否（exit 2 相当の Refusal）', async () => {
  const root = makeRoot();
  try {
    await assert.rejects(
      () => call('role', { positional: ['show', 'nonexistent'], root, jsonMode: true }),
      (e) => e.isRefusal && e.exitCode === 2
    );
  } finally {
    cleanup(root);
  }
});

test('role show 以外のサブコマンドは拒否', async () => {
  const root = makeRoot();
  try {
    await assert.rejects(
      () => call('role', { positional: ['edit', 'planner'], root, jsonMode: true }),
      (e) => e.isRefusal
    );
  } finally {
    cleanup(root);
  }
});

test('role card が存在しなければ拒否', async () => {
  const root = makeRoot();
  try {
    await assert.rejects(
      () => call('role', { positional: ['show', 'worker'], root, jsonMode: true }),
      (e) => e.isRefusal
    );
  } finally {
    cleanup(root);
  }
});

// --- status overview ---------------------------------------------------

test('status 全体 view: nodes / runs / gaps を導出する', async () => {
  const root = makeRoot();
  try {
    put(root, 'spec:s001', 'created');
    put(root, 'spec:s001', 'transitioned', { data: { from: 'draft', to: 'ready' } });
    put(root, 'campaign:c001', 'created');
    put(root, 'run:r-1', 'created', { data: { type: 'normal', campaign: 'c001' } });
    put(root, 'gap:g001', 'gap.opened', {
      data: { kind: 'needs-info', blocking: false, route: 'vision', target: 'spec:s001' },
    });

    const { result } = await call('status', { positional: [], root, jsonMode: true });
    assert.equal(result.ok, true);
    assert.equal(result.view, 'status');
    const spec = result.nodes.find((n) => n.subject === 'spec:s001');
    assert.equal(spec.status, 'ready');
    const run = result.runs.find((r) => r.id === 'r-1');
    assert.equal(run.status, 'created');
    assert.equal(run.campaign, 'c001');
    const gap = result.gaps.find((g) => g.id === 'g001');
    assert.equal(gap.route, 'vision');
    // run ノードは nodes 側からは除外される。
    assert.ok(!result.nodes.some((n) => n.subject.startsWith('run:')));
  } finally {
    cleanup(root);
  }
});

// --- status stale 検出 --------------------------------------------------

test('status: running かつ最終 event から stale_minutes 以上経過で stale 表示', async () => {
  const root = makeRoot();
  try {
    // created + session.started を古い ts で手置きする（append は現在時刻を付すため直接書く）。
    const oldTs = new Date(Date.now() - 60 * 60000).toISOString(); // 60 分前
    const mk = (id, type, extra = {}) => {
      const rec = {
        id: String(id).padStart(26, '0'),
        ts: oldTs,
        actor: { kind: 'cli' },
        type,
        subject: 'run:r-stale',
        ...extra,
      };
      write(root, path.join('journal', `${rec.id}.json`), JSON.stringify(rec, null, 2) + '\n');
    };
    mk(1, 'created', { data: { type: 'normal' } });
    mk(2, 'session.started');

    const { result } = await call('status', { positional: [], root, jsonMode: true });
    const run = result.runs.find((r) => r.id === 'r-stale');
    assert.equal(run.running, true);
    assert.equal(run.stale, true);
    assert.ok(run.stale_minutes >= 15);
  } finally {
    cleanup(root);
  }
});

test('status: session 未開始の run は running でない（stale にならない）', async () => {
  const root = makeRoot();
  try {
    const oldTs = new Date(Date.now() - 60 * 60000).toISOString();
    const rec = {
      id: '1'.padStart(26, '0'),
      ts: oldTs,
      actor: { kind: 'cli' },
      type: 'created',
      subject: 'run:r-nosess',
      data: { type: 'normal' },
    };
    write(root, path.join('journal', `${rec.id}.json`), JSON.stringify(rec, null, 2) + '\n');

    const { result } = await call('status', { positional: [], root, jsonMode: true });
    const run = result.runs.find((r) => r.id === 'r-nosess');
    assert.equal(run.running, false);
    assert.equal(run.stale, false);
  } finally {
    cleanup(root);
  }
});

test('status: 終端 run（accepted）は running でない', async () => {
  const root = makeRoot();
  try {
    const oldTs = new Date(Date.now() - 60 * 60000).toISOString();
    const mk = (id, type, extra = {}) => {
      const rec = {
        id: String(id).padStart(26, '0'),
        ts: oldTs,
        actor: { kind: 'cli' },
        type,
        subject: 'run:r-done',
        ...extra,
      };
      write(root, path.join('journal', `${rec.id}.json`), JSON.stringify(rec, null, 2) + '\n');
    };
    mk(1, 'created', { data: { type: 'normal' } });
    mk(2, 'session.started');
    mk(3, 'transitioned', { data: { from: 'verified', to: 'accepted' } });

    const { result } = await call('status', { positional: [], root, jsonMode: true });
    const run = result.runs.find((r) => r.id === 'r-done');
    assert.equal(run.running, false);
    assert.equal(run.stale, false);
  } finally {
    cleanup(root);
  }
});

// --- status <ref> 単一ノード + 可能遷移提示 ------------------------------

test('status <ref>: run の可能遷移を状態別に提示する', async () => {
  const root = makeRoot();
  try {
    put(root, 'run:r-1', 'created', { data: { type: 'normal' } });
    put(root, 'run:r-1', 'transitioned', { data: { from: 'created', to: 'handed-off' } });
    const { result } = await call('status', { positional: ['run:r-1'], root, jsonMode: true });
    assert.equal(result.status, 'handed-off');
    assert.ok(result.next.some((c) => c.includes('run return')));
  } finally {
    cleanup(root);
  }
});

test('status <ref>: verified run は accept / block / escalate を提示', async () => {
  const root = makeRoot();
  try {
    put(root, 'run:r-1', 'created');
    put(root, 'run:r-1', 'transitioned', { data: { from: 'returned', to: 'verified' } });
    const { result } = await call('status', { positional: ['run:r-1'], root, jsonMode: true });
    assert.ok(result.next.some((c) => c.includes('run accept')));
    assert.ok(result.next.some((c) => c.includes('run block')));
    assert.ok(result.next.some((c) => c.includes('run escalate')));
  } finally {
    cleanup(root);
  }
});

// 修正 4: run の status ref view は spec を露出する（node.spec 一次、upstream refs 二次）。
test('status <ref>: run view は spec を露出する（created data.spec 由来）', async () => {
  const root = makeRoot();
  try {
    put(root, 'run:r-1', 'created', { data: { type: 'normal', campaign: 'c001', spec: 's001' } });
    const { result } = await call('status', { positional: ['run:r-1'], root, jsonMode: true });
    assert.ok(result.run, 'run view があるべき');
    assert.equal(result.run.campaign, 'c001', 'campaign が露出される');
    assert.equal(result.run.spec, 'spec:s001', 'spec が spec:<id> 正規形で露出される');
  } finally {
    cleanup(root);
  }
});

// spec が created data に無くても upstream ref（run open の buildOpenRefs 由来）から導出する。
test('status <ref>: run view の spec は upstream ref からも導出できる', async () => {
  const root = makeRoot();
  try {
    put(root, 'run:r-1', 'created', {
      data: { type: 'normal', campaign: 'c001' },
      refs: [{ rel: 'campaign', to: 'campaign:c001' }, { rel: 'upstream', to: 'spec:s002' }],
    });
    const { result } = await call('status', { positional: ['run:r-1'], root, jsonMode: true });
    assert.equal(result.run.spec, 'spec:s002', 'upstream ref から spec を導出する');
  } finally {
    cleanup(root);
  }
});

// adhoc run（spec 紐付けなし）は spec=null。
test('status <ref>: spec 紐付けの無い adhoc run は spec=null', async () => {
  const root = makeRoot();
  try {
    put(root, 'run:r-1', 'created', { data: { type: 'normal' } });
    const { result } = await call('status', { positional: ['run:r-1'], root, jsonMode: true });
    assert.equal(result.run.spec, null, 'spec 未紐付けは null');
  } finally {
    cleanup(root);
  }
});

test('status <ref>: 存在しない ref は拒否', async () => {
  const root = makeRoot();
  try {
    await assert.rejects(
      () => call('status', { positional: ['spec:nope'], root, jsonMode: true }),
      (e) => e.isRefusal
    );
  } finally {
    cleanup(root);
  }
});

// --- status --plan ------------------------------------------------------

test('status --plan: route=vision の計画在庫 gap を射影する', async () => {
  const root = makeRoot();
  try {
    put(root, 'gap:g001', 'gap.opened', {
      data: { kind: 'candidate', blocking: false, route: 'vision', target: 'vision:v001' },
    });
    // route=vision だが closed は在庫から除外。
    put(root, 'gap:g002', 'gap.opened', {
      data: { kind: 'candidate', blocking: false, route: 'vision', target: 'vision:v001' },
    });
    put(root, 'gap:g002', 'gap.closed', { data: { to: 'closed' } });
    // route=spec は plan 射影に出さない。
    put(root, 'gap:g003', 'gap.opened', {
      data: { kind: 'needs-info', blocking: false, route: 'spec', target: 'spec:s001' },
    });

    const { result } = await call('status', { positional: [], flags: { plan: true }, root, jsonMode: true });
    assert.equal(result.view, 'plan');
    const ids = result.plan_gaps.map((g) => g.id);
    assert.deepEqual(ids, ['g001']);
  } finally {
    cleanup(root);
  }
});

test('status --plan: campaign を depends_on 順に並べ未充足依存を明示する', async () => {
  const root = makeRoot();
  try {
    // c002 は c001 に依存する。c001 は未 closed。
    append(root, {
      type: 'created',
      subject: 'campaign:c001',
      actor: { kind: 'cli' },
      refs: [{ rel: 'covers', to: 'spec:s001' }],
    });
    append(root, {
      type: 'created',
      subject: 'campaign:c002',
      actor: { kind: 'cli' },
      refs: [
        { rel: 'covers', to: 'spec:s002' },
        { rel: 'depends_on', to: 'campaign:c001' },
      ],
    });

    const { result } = await call('status', { positional: [], flags: { plan: true }, root, jsonMode: true });
    const c1 = result.campaigns.find((c) => c.id === 'c001');
    const c2 = result.campaigns.find((c) => c.id === 'c002');
    // c001 が先、c002 が後。
    assert.ok(c1.order < c2.order);
    // c002 は covers を射影している。
    assert.deepEqual(c2.coverage, ['spec:s002']);
    // c001 が未 closed のため c002 は blocked_by に c001 を持つ。
    assert.deepEqual(c2.blocked_by, ['campaign:c001']);
  } finally {
    cleanup(root);
  }
});

test('status --plan: 依存が closed なら blocked_by は空', async () => {
  const root = makeRoot();
  try {
    put(root, 'campaign:c001', 'created');
    put(root, 'campaign:c001', 'transitioned', { data: { from: 'active', to: 'closed' } });
    put(root, 'campaign:c002', 'created', { refs: [{ rel: 'depends_on', to: 'campaign:c001' }] });
    const { result } = await call('status', { positional: [], flags: { plan: true }, root, jsonMode: true });
    const c2 = result.campaigns.find((c) => c.id === 'c002');
    assert.deepEqual(c2.blocked_by, []);
  } finally {
    cleanup(root);
  }
});

// --- inbox --------------------------------------------------------------

test('inbox: open decisions / escalations / close 待ち campaign / report を列挙', async () => {
  const root = makeRoot();
  try {
    // open decision（decided でない）
    put(root, 'decision:d001', 'created');
    // decided な decision は inbox に出ない
    put(root, 'decision:d002', 'created');
    put(root, 'decision:d002', 'decision.recorded', { actor: { kind: 'human' } });
    // escalated run
    put(root, 'run:r-esc', 'created');
    put(root, 'run:r-esc', 'transitioned', { data: { from: 'verified', to: 'escalated' } });
    // active campaign（close 待ち）
    put(root, 'campaign:c001', 'created');
    put(root, 'campaign:c001', 'transitioned', { data: { from: 'draft', to: 'active' } });
    // report ノード
    put(root, 'report:r-esc', 'created', { data: { source: 'run:r-esc' } });

    const { result } = await call('inbox', { positional: [], root, jsonMode: true });
    assert.equal(result.view, 'inbox');
    assert.deepEqual(result.open_decisions, ['decision:d001']);
    assert.deepEqual(result.escalations, ['run:r-esc']);
    assert.deepEqual(result.close_waiting_campaigns, ['campaign:c001']);
    assert.deepEqual(result.reports, ['report:r-esc']);
  } finally {
    cleanup(root);
  }
});

test('inbox: stale run を要対応に列挙', async () => {
  const root = makeRoot();
  try {
    const oldTs = new Date(Date.now() - 60 * 60000).toISOString();
    const mk = (id, type, extra = {}) => {
      const rec = {
        id: String(id).padStart(26, '0'),
        ts: oldTs,
        actor: { kind: 'cli' },
        type,
        subject: 'run:r-stale',
        ...extra,
      };
      write(root, path.join('journal', `${rec.id}.json`), JSON.stringify(rec, null, 2) + '\n');
    };
    mk(1, 'created', { data: { type: 'normal' } });
    mk(2, 'session.started');

    const { result } = await call('inbox', { positional: [], root, jsonMode: true });
    assert.equal(result.stale_runs.length, 1);
    assert.equal(result.stale_runs[0].id, 'run:r-stale');
  } finally {
    cleanup(root);
  }
});

// --- report -------------------------------------------------------------

test('report run: skeleton 生成 + tool-owned 機械記入 + created event', async () => {
  const root = makeRoot();
  try {
    put(root, 'run:r-1', 'created', { data: { type: 'normal' } });
    // verification pass + off-surface を verify.recorded に焼く。
    put(root, 'run:r-1', 'verify.recorded', {
      data: { pass: true, off_surface: ['src/api/scratch.txt'] },
      payload: { path: 'evidence/verifications/r-1/verdict.json', sha256: 'h' },
    });
    // run gate review record。
    put(root, 'run:r-1', 'review.recorded', {
      actor: { kind: 'agent' },
      data: { gate: 'run' },
      payload: { path: 'x', sha256: 'sha-run' },
    });
    // 関連 gap。
    put(root, 'gap:g001', 'gap.opened', {
      data: { kind: 'needs-info', blocking: false, route: 'none', target: 'run:r-1' },
    });

    const before = readAll(root).length;
    const { result } = await call('report', { positional: ['run:r-1'], root, jsonMode: true });
    assert.equal(result.ok, true);
    assert.equal(result.path, path.join('out', 'r-1', 'report.md'));

    // tool-owned 欄が機械記入されている。
    assert.ok(result.tool_owned.verification_refs.some((r) => r.includes('r-1')));
    assert.ok(result.tool_owned.review_refs.some((r) => r.includes('#run')));
    assert.ok(result.tool_owned.off_surface.includes('src/api/scratch.txt'));
    assert.ok(result.tool_owned.gap_refs.includes('gap:g001'));

    // ファイルが書かれ、tool-owned / authored 両欄を含む。
    const body = fs.readFileSync(path.join(root, 'out', 'r-1', 'report.md'), 'utf8');
    assert.match(body, /## tool-owned/);
    assert.match(body, /## authored/);
    assert.match(body, /scope summary/);
    assert.match(body, /src\/api\/scratch\.txt/);

    // created event（subject=report:r-1）が 1 件増える。状態遷移は起こさない。
    const after = readAll(root);
    assert.equal(after.length, before + 1);
    const created = after.find(
      (e) => e.type === 'created' && e.subject === 'report:r-1'
    );
    assert.ok(created);
    assert.ok(!after.some((e) => e.type === 'transitioned' && e.subject === 'report:r-1'));
  } finally {
    cleanup(root);
  }
});

test('report campaign: 配下 run の verification と completion review を集約', async () => {
  const root = makeRoot();
  try {
    put(root, 'campaign:c001', 'created');
    put(root, 'run:r-1', 'created', { data: { type: 'normal', campaign: 'c001' } });
    put(root, 'run:r-1', 'verify.recorded', {
      data: { pass: true },
      payload: { path: 'p', sha256: 'h' },
    });
    put(root, 'campaign:c001', 'review.recorded', {
      actor: { kind: 'agent' },
      data: { gate: 'completion' },
      payload: { path: 'x', sha256: 'sha-c' },
    });

    const { result } = await call('report', { positional: ['campaign:c001'], root, jsonMode: true });
    assert.equal(result.ok, true);
    assert.ok(result.tool_owned.verification_refs.some((r) => r.includes('r-1')));
    assert.ok(result.tool_owned.review_refs.some((r) => r.includes('#completion')));
  } finally {
    cleanup(root);
  }
});

test('report: ref 未指定は拒否', async () => {
  const root = makeRoot();
  try {
    await assert.rejects(
      () => call('report', { positional: [], root, jsonMode: true }),
      (e) => e.isRefusal
    );
  } finally {
    cleanup(root);
  }
});

test('report: spec など run/campaign 以外は拒否', async () => {
  const root = makeRoot();
  try {
    append(root, { type: 'created', subject: 'spec:s001', actor: { kind: 'cli' } });
    await assert.rejects(
      () => call('report', { positional: ['spec:s001'], root, jsonMode: true }),
      (e) => e.isRefusal
    );
  } finally {
    cleanup(root);
  }
});

test('report: 存在しない run は拒否', async () => {
  const root = makeRoot();
  try {
    await assert.rejects(
      () => call('report', { positional: ['run:r-nope'], root, jsonMode: true }),
      (e) => e.isRefusal
    );
  } finally {
    cleanup(root);
  }
});

// --- root 未検出 --------------------------------------------------------

test('root が null なら init を促して拒否', async () => {
  await assert.rejects(
    () => views({ command: 'status', positional: [], flags: {}, root: null, jsonMode: true }),
    (e) => e.isRefusal && e.next.some((n) => n.includes('init'))
  );
});
