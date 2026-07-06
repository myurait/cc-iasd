import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { append, readAll, subjectKind, subjectId } from '../lib/journal.js';

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-jr-'));
}

test('append は id/ts を付与し journal/<ulid>.json を作る', () => {
  const root = tmpRoot();
  const id = append(root, {
    type: 'created',
    subject: 'spec:s001',
    actor: { kind: 'cli' },
  });
  assert.equal(id.length, 26);
  const file = path.join(root, 'journal', `${id}.json`);
  assert.ok(fs.existsSync(file));
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(rec.id, id);
  assert.ok(rec.ts);
  assert.equal(rec.subject, 'spec:s001');
});

test('readAll は ULID 昇順で返す', () => {
  const root = tmpRoot();
  const ids = [];
  for (let i = 0; i < 5; i++) {
    ids.push(append(root, { type: 'created', subject: `spec:s00${i}`, actor: { kind: 'cli' } }));
  }
  const events = readAll(root);
  const gotIds = events.map((e) => e.id);
  assert.deepEqual(gotIds, [...ids].sort());
});

test('append は未知の type を拒否', () => {
  const root = tmpRoot();
  assert.throws(() => append(root, { type: 'bogus', subject: 'x:1', actor: { kind: 'cli' } }));
});

test('append は subject 欠落を拒否', () => {
  const root = tmpRoot();
  assert.throws(() => append(root, { type: 'created', actor: { kind: 'cli' } }));
});

test('append は data/payload/refs を保持', () => {
  const root = tmpRoot();
  const id = append(root, {
    type: 'transitioned',
    subject: 'run:r-1',
    actor: { kind: 'agent' },
    data: { from: 'created', to: 'handed-off', guard_results: [] },
    refs: [{ rel: 'upstream', to: 'spec:s001' }],
  });
  const rec = readAll(root).find((e) => e.id === id);
  assert.equal(rec.data.to, 'handed-off');
  assert.equal(rec.refs[0].to, 'spec:s001');
});

test('subjectKind / subjectId', () => {
  assert.equal(subjectKind('spec:s001'), 'spec');
  assert.equal(subjectId('spec:s001'), 's001');
  assert.equal(subjectKind('run:r-abc-slug'), 'run');
  assert.equal(subjectId('run:r-abc-slug'), 'r-abc-slug');
});

test('readAll は空 journal で空配列', () => {
  const root = tmpRoot();
  assert.deepEqual(readAll(root), []);
});
