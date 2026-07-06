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
import { Refusal } from '../lib/refuse.js';

// --- test harness ---

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-run-'));
  initProjectContext(root);
  // journal ディレクトリを作り root marker を確立。
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  // 最小 config（既定で補完されるので空でよい）。
  write(root, 'cc-iasd.yaml', 'doc_lang: Japanese\n');
  // worker role card（handoff 合成に必須）。
  write(root, path.join('roles', 'worker.md'), '# worker\nhandoff を入力に src/ のみ編集する。\n');
  return root;
}

function snap(root) {
  return derive(readAll(root));
}

// stdout を捕捉するヘルパ（process.stdout.write を差し替える）。
async function capture(fn) {
  const orig = process.stdout.write;
  let out = '';
  process.stdout.write = (chunk) => {
    out += chunk;
    return true;
  };
  try {
    const ret = await fn();
    return { out, ret };
  } finally {
    process.stdout.write = orig;
  }
}

// --- e2e: adhoc の open -> handoff -> return -> verify(fail->pass) -> accept ---

test('adhoc run e2e: open -> handoff -> return -> verify(fail->pass) -> accept', async () => {
  const root = tmpRoot();
  // fail 用フラグファイル。存在すれば exit 0、なければ exit 1。
  const flag = path.join(root, 'runs', '_flag.txt');
  const check = `node -e "process.exit(require('fs').existsSync('${flag.replace(/\\/g, '/')}')?0:1)"`;

  // 1) run open --adhoc
  const opened = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: 'ログイン 500 を修正', check }, root })
  );
  const runId = opened.ret;
  assert.match(runId, /^r-[0-9A-Z]{26}-/);
  assert.equal(snap(root).runs[runId].status, 'handed-off');
  // handoff.md が runs/ と out/ に生成される。
  assert.ok(fs.existsSync(path.join(root, 'runs', runId, 'handoff.md')));
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'handoff.md')));

  // 2) run handoff -> stdout に本文
  const ho = await capture(() => run({ positional: ['handoff', runId], flags: {}, root }));
  assert.match(ho.out, /ログイン 500 を修正/);
  assert.match(ho.out, /Exit Protocol/);

  // 3) worker が notes を書く（authored）。
  write(root, path.join('runs', runId, 'notes.md'), '# notes\n\n## 実装メモ\nログインハンドラを修正した。\n');

  // 4) run return -> returned
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));
  assert.equal(snap(root).runs[runId].status, 'returned');
  // diff-snapshot note が記録される。
  assert.ok(readAll(root).some((e) => e.type === 'note.appended' && e.subject === `run:${runId}`));

  // 5) run verify（fail） -> verified 遷移するが verification.pass=false
  const vf = await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  assert.equal(vf.ret.pass, false);
  assert.equal(snap(root).runs[runId].status, 'verified');
  assert.equal(snap(root).verifications[runId].pass, false);

  // 6) accept は verification fail で拒否される。
  await assert.rejects(
    () => capture(() => run({ positional: ['accept', runId], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'verification'));
      return true;
    }
  );

  // 7) 実装を直す（フラグ作成） -> verify(pass)
  fs.mkdirSync(path.dirname(flag), { recursive: true });
  fs.writeFileSync(flag, 'ok');
  const vp = await capture(() => run({ positional: ['verify', runId], flags: {}, root }));
  assert.equal(vp.ret.pass, true);
  assert.equal(snap(root).verifications[runId].pass, true);

  // 8) accept は gate=run review が無いと拒否（config 既定 gates.run=required）。
  await assert.rejects(
    () => capture(() => run({ positional: ['accept', runId], flags: {}, root })),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'run-review'));
      return true;
    }
  );

  // 9) gate=run の review record を notes の content-hash で記録する。
  const notes = fs.readFileSync(path.join(root, 'runs', runId, 'notes.md'), 'utf8');
  append(root, {
    type: 'review.recorded',
    subject: `run:${runId}`,
    actor: { kind: 'agent' },
    data: { gate: 'run' },
    payload: { path: `runs/${runId}/notes.md`, sha256: contentHash(notes) },
  });

  // 10) accept -> accepted
  const acc = await capture(() => run({ positional: ['accept', runId], flags: {}, root }));
  assert.equal(acc.ret, runId);
  assert.equal(snap(root).runs[runId].status, 'accepted');
});

// --- 破り試行: verification なしで accept は拒否 ---

test('verification なしで run accept は拒否', async () => {
  const root = tmpRoot();
  const opened = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: '調査', check: 'node -e "process.exit(0)"' }, root })
  );
  const runId = opened.ret;
  // verified まで進める（return -> verify）。
  write(root, path.join('runs', runId, 'notes.md'), '## 実装メモ\nx\n');
  await capture(() => run({ positional: ['return', runId], flags: {}, root }));
  // verify を飛ばして直接 accept -> run-state が verified でないため拒否。
  await assert.rejects(
    () => capture(() => run({ positional: ['accept', runId], flags: {}, root })),
    Refusal
  );
});

// --- 破り試行: adhoc で --check 欠落は拒否（spike を除く） ---

test('adhoc で --check 欠落は欠落列挙つき拒否', async () => {
  const root = tmpRoot();
  await assert.rejects(
    () => capture(() => run({ positional: ['open'], flags: { adhoc: 'goal のみ' }, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'adhoc.check'));
      return true;
    }
  );
});

// --- spike run は --check 不要で open できる ---

test('spike run は check なしで open -> handed-off', async () => {
  const root = tmpRoot();
  const opened = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: 'アーキ調査', spike: true }, root })
  );
  const runId = opened.ret;
  assert.equal(snap(root).runs[runId].type, 'spike');
  assert.equal(snap(root).runs[runId].status, 'handed-off');
});

// --- run block: backtrack request を report.md に生成し blocked へ ---

test('run block は backtrack request を生成し blocked へ', async () => {
  const root = tmpRoot();
  const opened = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: 'x', check: 'node -e "process.exit(0)"' }, root })
  );
  const runId = opened.ret;
  await capture(() =>
    run({ positional: ['block', runId], flags: { missing: 'spec:s001' }, root })
  );
  assert.equal(snap(root).runs[runId].status, 'blocked');
  const report = fs.readFileSync(path.join(root, 'runs', runId, 'report.md'), 'utf8');
  assert.match(report, /backtrack request/);
  assert.match(report, /blocked stage/);
  assert.match(report, /欠落上流 ref/);
  assert.match(report, /spec:s001/);
  // --missing 欠落は拒否。
  const o2 = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: 'y', check: 'node -e "process.exit(0)"' }, root })
  );
  await assert.rejects(
    () => capture(() => run({ positional: ['block', o2.ret], flags: {}, root })),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === '--missing'));
      return true;
    }
  );
});

// --- run escalate: escalation packet を生成し escalated へ ---

test('run escalate は escalation packet を生成し escalated へ', async () => {
  const root = tmpRoot();
  const opened = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: 'x', check: 'node -e "process.exit(0)"' }, root })
  );
  const runId = opened.ret;
  await capture(() =>
    run({ positional: ['escalate', runId], flags: { reason: '文字コード未確定' }, root })
  );
  assert.equal(snap(root).runs[runId].status, 'escalated');
  const report = fs.readFileSync(path.join(root, 'runs', runId, 'report.md'), 'utf8');
  assert.match(report, /escalation packet/);
  assert.match(report, /停止理由/);
  assert.match(report, /文字コード未確定/);
  assert.match(report, /再開条件/);
});

// --- reject 上限到達で accept 封鎖 -> escalate 誘導 ---

test('reject 上限到達で accept は封鎖され escalate を促す', async () => {
  const root = tmpRoot();
  const opened = await capture(() =>
    run({ positional: ['open'], flags: { adhoc: 'x', check: 'node -e "process.exit(0)"' }, root })
  );
  const runId = opened.ret;
  const subject = `run:${runId}`;
  // reject_count を上限（既定 2）まで積む: blocked 遷移を 2 回。
  // block -> 再 open は本テストでは journal を直接操作して verified に戻す簡略経路をとる。
  const { attempt } = await import('../lib/transitions.js');
  attempt(root, { subject, from: 'handed-off', to: 'blocked', guards: [], actor: { kind: 'cli' }, autoCommit: false });
  attempt(root, { subject, from: 'blocked', to: 'verified', guards: [], actor: { kind: 'cli' }, autoCommit: false });
  attempt(root, { subject, from: 'verified', to: 'blocked', guards: [], actor: { kind: 'cli' }, autoCommit: false });
  attempt(root, { subject, from: 'blocked', to: 'verified', guards: [], actor: { kind: 'cli' }, autoCommit: false });
  assert.equal(snap(root).runs[runId].reject_count, 2);
  await assert.rejects(
    () => capture(() => run({ positional: ['accept', runId], flags: {}, root })),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'reject-limit'));
      assert.ok(e.next.some((n) => n.includes('escalate')));
      return true;
    }
  );
});

// --- run handoff: 未生成 run で拒否 ---

test('run handoff は handoff.md 不在で拒否', async () => {
  const root = tmpRoot();
  await assert.rejects(
    () => capture(() => run({ positional: ['handoff', 'r-nope'], flags: {}, root })),
    Refusal
  );
});
