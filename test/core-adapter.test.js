import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveAdapter, KNOWN_ADAPTERS } from '../lib/adapters/index.js';
import { initProjectContext } from '../lib/gitops.js';

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-adp-'));
  initProjectContext(root);
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  return root;
}

const ctx = {
  cfg: { doc_lang: 'Japanese' },
  handoffMd: '# handoff: r-x\n\n## Requirements\n\nやること\n',
  roleCard: '# worker\n出力言語は Japanese。\n',
  reposBase: { api: 'abc123' },
  docLang: 'Japanese',
};

// --- resolveAdapter: 既知名 / 未実装 / 未知名 ---

test('resolveAdapter は none / claude-code を解決する', () => {
  assert.equal(resolveAdapter('none').name, 'none');
  assert.equal(resolveAdapter('claude-code').name, 'claude-code');
  // 未指定は none。
  assert.equal(resolveAdapter().name, 'none');
});

test('resolveAdapter は未実装 codex を none 実装で代替する', () => {
  const a = resolveAdapter('codex');
  assert.equal(a.name, 'codex');
  assert.equal(a.fallback, 'none');
  assert.ok(KNOWN_ADAPTERS.includes('codex'));
});

test('resolveAdapter は未知名を none 代替にする', () => {
  const a = resolveAdapter('gpt-9000');
  assert.equal(a.name, 'none');
  assert.equal(a.fallback, 'none');
  assert.equal(a.requested, 'gpt-9000');
});

// --- none adapter: compile は bundle.md のみ / launch は note ---

test('none adapter は bundle.md を compile し launch は起動しない', () => {
  const root = tmpRoot();
  const a = resolveAdapter('none');
  const out = a.compile(root, 'r-x', ctx);
  assert.deepEqual(out.files, [path.join('out', 'r-x', 'bundle.md')]);
  assert.ok(fs.existsSync(path.join(root, 'out', 'r-x', 'bundle.md')));
  const bundle = fs.readFileSync(path.join(root, 'out', 'r-x', 'bundle.md'), 'utf8');
  assert.match(bundle, /## handoff/);
  assert.match(bundle, /api: base=abc123/);

  const launch = a.launch(root, 'r-x', ctx);
  // none は起動しない -> command は null、note に手順。
  assert.equal(launch.command, null);
  assert.match(launch.note, /adapter=none/);
  assert.match(launch.note, /run return/);

  // capability は全 none。
  assert.equal(a.capability.writeGuard, 'none');
  assert.equal(a.capability.journal, 'none');
});

// --- none adapter: resume brief を bundle 末尾に連結する ---

test('none adapter は resume brief を bundle に連結する', () => {
  const root = tmpRoot();
  const a = resolveAdapter('none');
  a.compile(root, 'r-y', { ...ctx, resumeBriefMd: '# resume brief: r-y\n\n差分あり\n' });
  const bundle = fs.readFileSync(path.join(root, 'out', 'r-y', 'bundle.md'), 'utf8');
  assert.match(bundle, /## resume brief/);
  assert.match(bundle, /差分あり/);
});

// --- claude-code adapter: compile は settings/hook を追加生成 ---

test('claude-code adapter は settings.json と write-guard hook を生成する', () => {
  const root = tmpRoot();
  const a = resolveAdapter('claude-code');
  const out = a.compile(root, 'r-z', ctx);
  // bundle.md + settings.json + write-guard.mjs。
  assert.ok(out.files.includes(path.join('out', 'r-z', 'bundle.md')));
  assert.ok(out.files.includes(path.join('out', 'r-z', 'settings', 'settings.json')));
  assert.ok(out.files.includes(path.join('out', 'r-z', 'settings', 'write-guard.mjs')));

  const settings = JSON.parse(
    fs.readFileSync(path.join(root, 'out', 'r-z', 'settings', 'settings.json'), 'utf8')
  );
  assert.equal(settings.cc_iasd.run, 'r-z');
  assert.ok(settings.hooks.PreToolUse);

  const hook = fs.readFileSync(path.join(root, 'out', 'r-z', 'settings', 'write-guard.mjs'), 'utf8');
  // src/ 外書込 deny の決定論ロジックを含む。
  assert.match(hook, /src\\\//);
  assert.match(hook, /block/);

  // launch は起動コマンドを返す（実起動はしない）。
  const launch = a.launch(root, 'r-z', ctx);
  assert.match(launch.command, /claude --settings/);
  assert.equal(a.capability.writeGuard, 'hook');
});
