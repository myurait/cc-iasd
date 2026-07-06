import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as humans from '../lib/commands/humans.js';
import { readAll } from '../lib/journal.js';
import { derive } from '../lib/state.js';
import { contentHash } from '../lib/hash.js';
import { initProjectContext } from '../lib/gitops.js';
import { write } from '../lib/writePath.js';
import { Refusal } from '../lib/refuse.js';

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-humans-'));
  initProjectContext(root);
  // cc-iasd.yaml（既定: require_tty=true, allow_adopt=false）を配置。
  write(root, 'cc-iasd.yaml', 'doc_lang: Japanese\ndev_lang: TypeScript\n');
  return root;
}

// stdout を捕捉して humans.run を呼ぶ（jsonMode で機械可読）。
function invoke(root, command, positional, flags = {}) {
  const chunks = [];
  const orig = process.stdout.write;
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  try {
    humans.run({ command, positional, flags: { ...flags, json: true }, root, jsonMode: true });
  } finally {
    process.stdout.write = orig;
  }
  const out = chunks.join('');
  return out.trim() ? JSON.parse(out.trim().split('\n').pop()) : null;
}

// gap.opened の target を明示するため gap add を使わず直接 event を組む補助はせず、
// gap add コマンドで起票してから使う。

test('gap add は gNNN 連番で起票し gap.opened event を残す', () => {
  const root = tmpRoot();
  const r1 = invoke(root, 'gap', ['add', 'spec:s001'], { kind: 'needs-info', route: 'vision' });
  assert.equal(r1.gap, 'gap:g001');
  const r2 = invoke(root, 'gap', ['add', 'spec:s001'], { kind: 'candidate' });
  assert.equal(r2.gap, 'gap:g002');
  const snap = derive(readAll(root));
  assert.equal(snap.gaps.g001.status, 'open');
  assert.equal(snap.gaps.g001.route, 'vision');
  assert.equal(snap.gaps.g002.kind, 'candidate');
  // authored 本文が gaps/ に生成されていること。
  assert.ok(fs.existsSync(path.join(root, r1.path)));
});

test('blocking gap は route できず、decide 経由でのみ close できる', () => {
  const root = tmpRoot();
  // blocking gap を起票する。
  const g = invoke(root, 'gap', ['add', 'spec:s001'], {
    kind: 'needs-human-decision',
    blocking: true,
  });
  const gid = g.gap.slice('gap:'.length);

  // route は blocking のため拒否される。
  assert.throws(
    () => invoke(root, 'gap', ['route', gid], { to: 'vision:v001' }),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.equal(e.missing[0].input, 'blocking');
      return true;
    }
  );

  // decision 未 decided の状態では close も拒否される。
  assert.throws(
    () => invoke(root, 'gap', ['close', gid], { decision: 'd001-x' }),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.equal(e.missing[0].input, 'decision');
      return true;
    }
  );

  // decide で decision を decided にする（TTY 検査回避のため stdin.isTTY を立てる）。
  const origTty = process.stdin.isTTY;
  process.stdin.isTTY = true;
  try {
    invoke(root, 'decide', ['d001-x'], {});
  } finally {
    process.stdin.isTTY = origTty;
  }
  const snapAfterDecide = derive(readAll(root));
  assert.equal(snapAfterDecide.nodes['decision:d001-x'].status, 'decided');

  // decided になったので blocking gap を close できる。
  const closed = invoke(root, 'gap', ['close', gid], { decision: 'd001-x' });
  assert.equal(closed.to, 'closed');
  const snap = derive(readAll(root));
  assert.equal(snap.gaps[gid].status, 'closed');
});

test('decide は非 TTY を拒否する（require_tty 既定）', () => {
  const root = tmpRoot();
  const origTty = process.stdin.isTTY;
  process.stdin.isTTY = false;
  try {
    assert.throws(
      () => invoke(root, 'decide', ['d001-x'], {}),
      (e) => {
        assert.ok(e instanceof Refusal);
        assert.equal(e.missing[0].input, 'tty');
        return true;
      }
    );
  } finally {
    process.stdin.isTTY = origTty;
  }
});

test('decide --adopt は allow_adopt=false で拒否される', () => {
  const root = tmpRoot();
  const adoptFile = path.join(root, 'incoming-decision.md');
  fs.writeFileSync(adoptFile, '# decision\n本文\n');
  const origTty = process.stdin.isTTY;
  process.stdin.isTTY = true;
  try {
    assert.throws(
      () => invoke(root, 'decide', ['d001-x'], { adopt: adoptFile }),
      (e) => {
        assert.ok(e instanceof Refusal);
        assert.equal(e.missing[0].input, 'adopt');
        return true;
      }
    );
  } finally {
    process.stdin.isTTY = origTty;
  }
});

test('decide --adopt は allow_adopt=true で取込され journal に adopt 経路を刻む', () => {
  const root = tmpRoot();
  write(root, 'cc-iasd.yaml', 'decision:\n  allow_adopt: true\n');
  const adoptFile = path.join(root, 'incoming-decision.md');
  fs.writeFileSync(adoptFile, '# decision\n判断: BOM 付き UTF-8\n');
  const origTty = process.stdin.isTTY;
  process.stdin.isTTY = true;
  let res;
  try {
    res = invoke(root, 'decide', ['d002-enc'], { adopt: adoptFile });
  } finally {
    process.stdin.isTTY = origTty;
  }
  assert.equal(res.channel, 'adopt');
  const ev = readAll(root).find((e) => e.type === 'decision.recorded');
  assert.equal(ev.actor.kind, 'human');
  assert.equal(ev.data.actor_channel, 'adopt');
  // decisions/ に本文が取り込まれていること。
  assert.ok(fs.existsSync(path.join(root, 'decisions', 'd002-enc.md')));
});

test('decide --approve vision は draft->approved を起こす', () => {
  const root = tmpRoot();
  write(root, 'vision/v001-core.md', '---\nid: v001\n---\n# vision\n本文\n');
  const origTty = process.stdin.isTTY;
  process.stdin.isTTY = true;
  let res;
  try {
    res = invoke(root, 'decide', ['d001-approve'], { approve: 'vision:v001' });
  } finally {
    process.stdin.isTTY = origTty;
  }
  assert.equal(res.released[0].target, 'vision:v001');
  const snap = derive(readAll(root));
  assert.equal(snap.nodes['vision:v001'].status, 'approved');
});

test('review record は対象 content-hash を刻印し evidence/reviews へ保存', () => {
  const root = tmpRoot();
  const specPath = 'specs/s001-x/spec.md';
  write(root, specPath, '---\nid: s001\n---\n## Requirements\nA\n');
  const res = invoke(root, 'review', ['record', 'spec:s001'], { gate: 'spec', verdict: 'pass' });
  assert.equal(res.verdict, 'pass');
  const expected = contentHash(fs.readFileSync(path.join(root, specPath), 'utf8'));
  assert.equal(res.sha256, expected);
  assert.ok(fs.existsSync(path.join(root, res.path)));
  const snap = derive(readAll(root));
  assert.equal(snap.reviews['spec:s001'].spec, expected);
});

test('stale review: 対象編集後は記録 hash が現在 hash と不一致になる（dirty 検出）', () => {
  const root = tmpRoot();
  const specRel = 'specs/s001-x/spec.md';
  write(root, specRel, '---\nid: s001\n---\n## Requirements\n初版\n');
  const rec = invoke(root, 'review', ['record', 'spec:s001'], { gate: 'spec', verdict: 'pass' });
  const recordedHash = rec.sha256;

  // 対象 spec を編集して content-hash を変える。
  write(root, specRel, '---\nid: s001\n---\n## Requirements\n改訂版（別本文）\n');
  const curHash = contentHash(fs.readFileSync(path.join(root, specRel), 'utf8'));

  // 記録された review hash は現在 hash と一致しない = stale。
  assert.notEqual(recordedHash, curHash);
  const snap = derive(readAll(root));
  assert.equal(snap.reviews['spec:s001'].spec, recordedHash);
  assert.notEqual(snap.reviews['spec:s001'].spec, curHash);
});

test('gap close --edited は stale review を hash 不一致で拒否し、再 review で通る', () => {
  const root = tmpRoot();
  const specRel = 'specs/s001-x/spec.md';
  write(root, specRel, '---\nid: s001\n---\n## Requirements\n初版\n');
  // needs-upstream-fix の gap（blocking=false, 対象 spec:s001）。
  const g = invoke(root, 'gap', ['add', 'spec:s001'], { kind: 'needs-upstream-fix' });
  const gid = g.gap.slice('gap:'.length);

  // 初版に対する review を記録。
  invoke(root, 'review', ['record', 'spec:s001'], { gate: 'spec', verdict: 'pass' });
  // 対象を編集（hash が変わる）。
  write(root, specRel, '---\nid: s001\n---\n## Requirements\n修正版\n');

  // 編集後の再 review 前は stale として close を拒否する。
  assert.throws(
    () => invoke(root, 'gap', ['close', gid], { edited: true }),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.equal(e.missing[0].input, 'review-hash');
      return true;
    }
  );

  // 修正版に対して再 review すると hash が一致し close できる。
  invoke(root, 'review', ['record', 'spec:s001'], { gate: 'spec', verdict: 'pass' });
  const closed = invoke(root, 'gap', ['close', gid], { edited: true });
  assert.equal(closed.to, 'closed');
});

test('review record run --verdict fail は reject_count を進め、上限で封鎖', () => {
  const root = tmpRoot();
  // reject_limit=2（既定）。run の notes.md を配置。
  write(root, 'runs/r-1/notes.md', '# notes\n実装ノート\n');
  const runRef = 'run:r-1';

  const r1 = invoke(root, 'review', ['record', runRef], { gate: 'run', verdict: 'fail' });
  assert.equal(r1.reject_count, 1);
  assert.equal(r1.reject_blocked, false);

  const r2 = invoke(root, 'review', ['record', runRef], { gate: 'run', verdict: 'fail' });
  assert.equal(r2.reject_count, 2);
  assert.equal(r2.reject_limit, 2);
  assert.equal(r2.reject_blocked, true);
});

test('review record は不正 gate / verdict を拒否', () => {
  const root = tmpRoot();
  write(root, 'specs/s001-x/spec.md', '---\nid: s001\n---\n本文\n');
  assert.throws(
    () => invoke(root, 'review', ['record', 'spec:s001'], { gate: 'bogus', verdict: 'pass' }),
    (e) => {
      assert.equal(e.missing[0].input, 'gate');
      return true;
    }
  );
  assert.throws(
    () => invoke(root, 'review', ['record', 'spec:s001'], { gate: 'spec', verdict: 'maybe' }),
    (e) => {
      assert.equal(e.missing[0].input, 'verdict');
      return true;
    }
  );
});
