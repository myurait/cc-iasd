import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attempt } from '../lib/transitions.js';
import { readAll } from '../lib/journal.js';
import { initProjectContext } from '../lib/gitops.js';
import { Refusal } from '../lib/refuse.js';

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-tr-'));
  initProjectContext(root);
  return root;
}

const pass = (name) => () => ({ name, pass: true, detail: 'ok' });
const failGuard = (name, detail) => () => ({ name, pass: false, detail });

test('全 guard pass で transitioned event を append し guard_results を焼込', () => {
  const root = tmpRoot();
  const res = attempt(root, {
    subject: 'spec:s001',
    from: 'draft',
    to: 'ready',
    guards: [pass('sections'), pass('no-blocking-gap')],
  });
  assert.ok(res.eventId);
  const events = readAll(root);
  const t = events.find((e) => e.type === 'transitioned');
  assert.equal(t.data.from, 'draft');
  assert.equal(t.data.to, 'ready');
  assert.equal(t.data.guard_results.length, 2);
  assert.ok(t.data.guard_results.every((g) => g.pass));
});

test('guard fail で Refusal を throw し journal に書かない', () => {
  const root = tmpRoot();
  assert.throws(
    () =>
      attempt(root, {
        subject: 'spec:s001',
        from: 'draft',
        to: 'ready',
        guards: [pass('sections'), failGuard('blocking-gap', 'g001 が open')],
        command: 'spec ready s001',
        next: ['cc-iasd decide d001'],
      }),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.equal(e.exitCode, 2);
      assert.equal(e.missing[0].input, 'blocking-gap');
      assert.deepEqual(e.next, ['cc-iasd decide d001']);
      return true;
    }
  );
  // journal に transitioned が書かれていないこと
  const events = readAll(root);
  assert.equal(events.filter((e) => e.type === 'transitioned').length, 0);
});

test('guard が例外を投げても fail 扱いで拒否', () => {
  const root = tmpRoot();
  assert.throws(
    () =>
      attempt(root, {
        subject: 'run:r-1',
        from: 'returned',
        to: 'verified',
        guards: [
          () => {
            throw new Error('boom');
          },
        ],
      }),
    Refusal
  );
});

test('next 関数形式で失敗ガードから次の一手を生成', () => {
  const root = tmpRoot();
  assert.throws(
    () =>
      attempt(root, {
        subject: 'run:r-1',
        from: 'verified',
        to: 'accepted',
        guards: [failGuard('verification', 'verify 未実行')],
        command: 'run accept r-1',
        next: (failed) => failed.map((f) => `fix:${f.name}`),
      }),
    (e) => {
      assert.deepEqual(e.next, ['fix:verification']);
      return true;
    }
  );
});
