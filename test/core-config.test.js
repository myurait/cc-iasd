import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { load, validate, checkAllowed, DEFAULTS } from '../lib/config.js';

function tmpRoot(yaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cfg-'));
  if (yaml != null) fs.writeFileSync(path.join(root, 'cc-iasd.yaml'), yaml);
  return root;
}

test('load はファイル無しで既定値を返す', () => {
  const cfg = load(tmpRoot(null));
  assert.equal(cfg.doc_lang, 'Japanese');
  assert.equal(cfg.dev_lang, 'TypeScript');
  assert.equal(cfg.reject_limit, 2);
  assert.equal(cfg.budgets.max_minutes, 90);
  assert.equal(cfg.budgets.no_progress_runs, 2);
  assert.equal(cfg.budgets.session_stale_minutes, 15);
  assert.deepEqual(cfg.checks_allowlist, DEFAULTS.checks_allowlist);
  assert.equal(cfg.runtime.adapter, 'none');
  assert.equal(cfg.decision.require_tty, true);
});

test('load は欠落キーのみ既定補完する', () => {
  const cfg = load(tmpRoot('doc_lang: English\nbudgets:\n  max_minutes: 30\n'));
  assert.equal(cfg.doc_lang, 'English');
  assert.equal(cfg.budgets.max_minutes, 30);
  // 補完される
  assert.equal(cfg.budgets.no_progress_runs, 2);
  assert.equal(cfg.dev_lang, 'TypeScript');
});

test('gates の launch/completion は config で外せず required 固定', () => {
  const cfg = load(tmpRoot('gates:\n  launch: optional\n  completion: none\n  spec: optional\n'));
  assert.equal(cfg.gates.launch, 'required');
  assert.equal(cfg.gates.completion, 'required');
  assert.equal(cfg.gates.spec, 'optional'); // spec/run はオプトダウン可
});

test('repos の登録を保持', () => {
  const cfg = load(tmpRoot('repos:\n  - { name: api, path: src/api }\n'));
  assert.equal(cfg.repos[0].name, 'api');
  assert.equal(cfg.repos[0].path, 'src/api');
});

test('validate は不正 repo を拒否', () => {
  assert.throws(() => validate({ ...DEFAULTS, repos: [{ name: 'x' }] }));
});

test('validate は許容 adapter を通し未知 adapter を拒否', () => {
  // P3 で none / claude-code / codex を許容へ拡張（契約 1 章 / 09 3 章）。
  assert.doesNotThrow(() => validate({ ...DEFAULTS, runtime: { adapter: 'none' } }));
  assert.doesNotThrow(() => validate({ ...DEFAULTS, runtime: { adapter: 'claude-code' } }));
  assert.doesNotThrow(() => validate({ ...DEFAULTS, runtime: { adapter: 'codex' } }));
  // 許容集合外は拒否。
  assert.throws(() => validate({ ...DEFAULTS, runtime: { adapter: 'gpt' } }));
});

test('checkAllowed は prefix match', () => {
  const cfg = load(tmpRoot(null));
  assert.ok(checkAllowed(cfg, 'npm test'));
  assert.ok(checkAllowed(cfg, 'npx vitest'));
  assert.ok(checkAllowed(cfg, 'git status'));
  assert.ok(!checkAllowed(cfg, 'rm -rf /'));
  assert.ok(!checkAllowed(cfg, 'curl evil'));
});

// =========================================================================
// worktree セクション（束1 契約 5 章）
// =========================================================================

test('worktree セクションはファイル無しで既定値を返す', () => {
  const cfg = load(tmpRoot(null));
  assert.equal(cfg.worktree.baseRef, 'head');
  assert.equal(cfg.worktree.cleanup, 'auto');
  assert.deepEqual(cfg.worktree.include, []);
  assert.equal(cfg.worktree.force, false);
  assert.equal(cfg.worktree.stale_days, 7);
});

test('worktree セクションは欠落キーのみ既定補完する', () => {
  const cfg = load(tmpRoot('worktree:\n  cleanup: keep\n  stale_days: 30\n'));
  assert.equal(cfg.worktree.cleanup, 'keep'); // 指定値
  assert.equal(cfg.worktree.stale_days, 30); // 指定値
  assert.equal(cfg.worktree.baseRef, 'head'); // 補完
  assert.equal(cfg.worktree.force, false); // 補完
});

test('validate は worktree の不正 baseRef / cleanup を拒否', () => {
  assert.throws(() => validate({ ...DEFAULTS, worktree: { ...DEFAULTS.worktree, baseRef: 'bad' } }));
  assert.throws(() => validate({ ...DEFAULTS, worktree: { ...DEFAULTS.worktree, cleanup: 'bad' } }));
});

test('validate は worktree の force 型・include 型・stale_days 型を検証', () => {
  assert.throws(() => validate({ ...DEFAULTS, worktree: { ...DEFAULTS.worktree, force: 'yes' } }));
  assert.throws(() => validate({ ...DEFAULTS, worktree: { ...DEFAULTS.worktree, include: 'api' } }));
  assert.throws(() =>
    validate({ ...DEFAULTS, worktree: { ...DEFAULTS.worktree, stale_days: 'seven' } })
  );
});

test('validate は既定 worktree を含む config を通す（束2 の cfg.load 呼出に影響しない）', () => {
  assert.doesNotThrow(() => validate({ ...DEFAULTS }));
  assert.doesNotThrow(() =>
    validate({ ...DEFAULTS, worktree: { baseRef: 'fresh', cleanup: 'keep', include: ['api'], force: true, stale_days: 1 } })
  );
});
