import test from 'node:test';
import assert from 'node:assert/strict';
import { derive, blockingGapsFor } from '../lib/state.js';

// derive はイベント配列を直接受け取る（journal 非依存）。
function ev(overrides, seq) {
  // ULID 昇順を保証するため id を数値パディングで生成。
  return {
    id: String(seq).padStart(26, '0'),
    ts: '2026-07-06T00:00:00.000Z',
    actor: { kind: 'cli' },
    ...overrides,
  };
}

test('created が初期状態を設定', () => {
  const s = derive([
    ev({ type: 'created', subject: 'vision:v001' }, 1),
    ev({ type: 'created', subject: 'spec:s001' }, 2),
    ev({ type: 'created', subject: 'campaign:c001' }, 3),
  ]);
  assert.equal(s.nodes['vision:v001'].status, 'draft');
  assert.equal(s.nodes['spec:s001'].status, 'draft');
  assert.equal(s.nodes['campaign:c001'].status, 'draft');
});

test('transitioned が status を進める', () => {
  const s = derive([
    ev({ type: 'created', subject: 'spec:s001' }, 1),
    ev({ type: 'transitioned', subject: 'spec:s001', data: { from: 'draft', to: 'ready' } }, 2),
  ]);
  assert.equal(s.nodes['spec:s001'].status, 'ready');
});

test('run の repos base commit と type を保持', () => {
  const s = derive([
    ev({ type: 'created', subject: 'run:r-1', data: { type: 'spike', repos: { api: 'abc' } } }, 1),
    ev({ type: 'commit.observed', subject: 'run:r-1', data: { repos: { web: 'def' } } }, 2),
  ]);
  assert.equal(s.runs['r-1'].type, 'spike');
  assert.equal(s.runs['r-1'].repos.api, 'abc');
  assert.equal(s.runs['r-1'].repos.web, 'def');
});

test('reject_count は blocked 遷移で加算', () => {
  const s = derive([
    ev({ type: 'created', subject: 'run:r-1' }, 1),
    ev({ type: 'transitioned', subject: 'run:r-1', data: { from: 'verified', to: 'blocked' } }, 2),
    ev({ type: 'transitioned', subject: 'run:r-1', data: { from: 'blocked', to: 'handed-off' } }, 3),
    ev({ type: 'transitioned', subject: 'run:r-1', data: { from: 'verified', to: 'blocked' } }, 4),
  ]);
  assert.equal(s.runs['r-1'].reject_count, 2);
  assert.equal(s.nodes['run:r-1'].reject_count, 2);
});

test('gap の open/close 状態', () => {
  const s = derive([
    ev(
      { type: 'gap.opened', subject: 'gap:g001', data: { kind: 'needs-human-decision', blocking: true, route: 'none', target: 'spec:s001' } },
      1
    ),
  ]);
  assert.equal(s.gaps.g001.status, 'open');
  assert.equal(s.gaps.g001.blocking, true);

  const s2 = derive([
    ev({ type: 'gap.opened', subject: 'gap:g001', data: { kind: 'needs-info', blocking: false, route: 'vision', target: 'spec:s001' } }, 1),
    ev({ type: 'gap.closed', subject: 'gap:g001', data: { to: 'routed' } }, 2),
  ]);
  assert.equal(s2.gaps.g001.status, 'routed');
});

test('verify.recorded と review.recorded を索引化', () => {
  const s = derive([
    ev({ type: 'created', subject: 'run:r-1' }, 1),
    ev({ type: 'verify.recorded', subject: 'run:r-1', data: { pass: true }, payload: { path: 'x', sha256: 'h' } }, 2),
    ev({ type: 'review.recorded', subject: 'spec:s001', data: { gate: 'spec' }, payload: { path: 'y', sha256: 'sha-spec' } }, 3),
  ]);
  assert.equal(s.verifications['r-1'].pass, true);
  assert.equal(s.runs['r-1'].verification.pass, true);
  assert.equal(s.reviews['spec:s001'].spec, 'sha-spec');
});

test('decision.recorded で decided に', () => {
  const s = derive([
    ev({ type: 'created', subject: 'decision:d001' }, 1),
    ev({ type: 'decision.recorded', subject: 'decision:d001', actor: { kind: 'human' } }, 2),
  ]);
  assert.equal(s.nodes['decision:d001'].status, 'decided');
});

test('blockingGapsFor は open な blocking gap を対象別に返す', () => {
  const s = derive([
    ev({ type: 'gap.opened', subject: 'gap:g001', data: { blocking: true, target: 'spec:s001', route: 'none' } }, 1),
    ev({ type: 'gap.opened', subject: 'gap:g002', data: { blocking: false, target: 'spec:s001', route: 'vision' } }, 2),
    ev({ type: 'gap.opened', subject: 'gap:g003', data: { blocking: true, target: 'spec:s002', route: 'none' } }, 3),
  ]);
  assert.deepEqual(blockingGapsFor(s, 'spec:s001'), ['g001']);
  assert.deepEqual(blockingGapsFor(s, 'spec:s002'), ['g003']);
});

test('derive は入力順に依存せず ULID 順で畳み込む', () => {
  const events = [
    ev({ type: 'transitioned', subject: 'spec:s001', data: { from: 'draft', to: 'ready' } }, 2),
    ev({ type: 'created', subject: 'spec:s001' }, 1),
  ];
  const s = derive(events);
  assert.equal(s.nodes['spec:s001'].status, 'ready');
});
