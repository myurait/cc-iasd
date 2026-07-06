import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { run as initRun } from '../lib/commands/init.js';
import { run as doctorRun } from '../lib/commands/doctor.js';
import { load as loadConfig } from '../lib/config.js';
import { readAll, append } from '../lib/journal.js';
import { write } from '../lib/writePath.js';
import { Refusal } from '../lib/refuse.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-init-'));
}

// stdout / process.exitCode を捕捉して doctor を実行するヘルパ。
function captureDoctor(root, opts = {}) {
  const chunks = [];
  const origWrite = process.stdout.write;
  const origExit = process.exitCode;
  process.exitCode = 0;
  process.stdout.write = (s) => {
    chunks.push(String(s));
    return true;
  };
  try {
    doctorRun({ root, jsonMode: true, ...opts });
  } finally {
    process.stdout.write = origWrite;
  }
  const out = chunks.join('');
  const exitCode = process.exitCode;
  process.exitCode = origExit || 0;
  const json = out.trim() ? JSON.parse(out.trim().split('\n').pop()) : null;
  return { json, exitCode };
}

function silentInit(args) {
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    initRun(args);
  } finally {
    process.stdout.write = origWrite;
  }
}

test('init は scaffold / cc-iasd.yaml / roles / journal / git init を作る', () => {
  const target = path.join(tmpDir(), 'proj');
  silentInit({
    positional: [target],
    flags: { 'doc-lang': 'Japanese', 'dev-lang': 'TypeScript', repo: 'api:src/api' },
    jsonMode: true,
  });

  // scaffold ディレクトリ
  for (const d of ['journal', 'vision', 'specs', 'campaigns', 'runs', 'evidence', 'decisions', 'gaps', 'roles', 'out']) {
    assert.ok(fs.existsSync(path.join(target, d)), `${d}/ が存在`);
  }
  assert.ok(fs.existsSync(path.join(target, 'evidence', 'verifications')));

  // cc-iasd.yaml が schema 通りに load できる + repo 登録
  const cfg = loadConfig(target);
  assert.equal(cfg.doc_lang, 'Japanese');
  assert.equal(cfg.dev_lang, 'TypeScript');
  assert.equal(cfg.repos[0].name, 'api');
  assert.equal(cfg.repos[0].path, 'src/api');

  // roles 3 cards + {{docLang}} 確定（プレースホルダ残存なし）
  for (const role of ['planner', 'worker', 'reviewer']) {
    const p = path.join(target, 'roles', `${role}.md`);
    assert.ok(fs.existsSync(p), `roles/${role}.md`);
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(!text.includes('{{docLang}}'), `${role}: {{docLang}} が確定されている`);
    assert.ok(text.includes('Japanese'), `${role}: doc_lang が焼き込まれている`);
  }

  // journal 初期化 event
  const events = readAll(target);
  assert.ok(events.some((e) => e.type === 'created' && e.subject === 'project:root'));

  // git init + 初回 commit + .gitignore（src/ と out/）
  assert.ok(fs.existsSync(path.join(target, '.git')));
  const gi = fs.readFileSync(path.join(target, '.gitignore'), 'utf8');
  assert.match(gi, /^src\/$/m);
  assert.match(gi, /^out\/$/m);
  const log = execFileSync('git', ['log', '--oneline'], { cwd: target, encoding: 'utf8' });
  assert.match(log, /init/);
});

test('--dev-lang / doc-lang 反映と英語 doc_lang の焼き込み', () => {
  const target = path.join(tmpDir(), 'en');
  silentInit({ positional: [target], flags: { 'doc-lang': 'English', 'dev-lang': 'Go' }, jsonMode: true });
  const cfg = loadConfig(target);
  assert.equal(cfg.doc_lang, 'English');
  assert.equal(cfg.dev_lang, 'Go');
  const planner = fs.readFileSync(path.join(target, 'roles', 'planner.md'), 'utf8');
  assert.ok(planner.includes('English'));
});

test('init 後の doctor は green', () => {
  const target = path.join(tmpDir(), 'green');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  const { json, exitCode } = captureDoctor(target);
  assert.equal(json.green, true, JSON.stringify(json.errors));
  assert.equal(exitCode, 0);
  assert.equal(json.errors.length, 0);
});

test('既存 project-context への再 init は拒否', () => {
  const target = path.join(tmpDir(), 'dup');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  assert.throws(
    () => silentInit({ positional: [target], flags: {}, jsonMode: true }),
    (e) => e instanceof Refusal,
  );
});

test('doctor は root が無ければ拒否（exit 2）', () => {
  const empty = tmpDir();
  assert.throws(
    () => doctorRun({ root: empty, jsonMode: true }),
    (e) => e instanceof Refusal && e.exitCode === 2,
  );
});

test('doctor は src/ 配下の管理物混入を検出（red）', () => {
  const target = path.join(tmpDir(), 'contam');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  // src/ 配下に管理物（journal/）を置く = 隔離違反
  fs.mkdirSync(path.join(target, 'src', 'journal'), { recursive: true });
  const { json, exitCode } = captureDoctor(target);
  assert.equal(json.green, false);
  assert.equal(exitCode, 1);
  assert.ok(json.errors.some((f) => f.check === 'src-contamination'));
});

test('doctor は裸マーカー（台帳にない gap 参照）を検出', () => {
  const target = path.join(tmpDir(), 'marker');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  // 台帳（gap.opened）に無い g999 を spec 本文が参照する
  write(target, path.join('specs', 's001-x', 'spec.md'), '---\nid: s001\nrefs: []\n---\n\n本文 [UNRESOLVED: g999] です。\n');
  const { json } = captureDoctor(target);
  assert.equal(json.green, false);
  assert.ok(json.errors.some((f) => f.check === 'bare-marker' && /g999/.test(f.detail)));
});

test('doctor は台帳に存在する gap 参照は許容する', () => {
  const target = path.join(tmpDir(), 'marker-ok');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  append(target, {
    type: 'gap.opened',
    subject: 'gap:g001',
    actor: { kind: 'agent' },
    data: { kind: 'needs-human-decision', blocking: true, route: 'spec' },
  });
  write(target, path.join('specs', 's001-x', 'spec.md'), '---\nid: s001\nrefs: []\n---\n\n本文 [UNRESOLVED: g001] です。\n');
  const { json } = captureDoctor(target);
  assert.ok(!json.errors.some((f) => f.check === 'bare-marker'), JSON.stringify(json.errors));
});

test('doctor は登録 repo の実体欠落を検出', () => {
  const target = path.join(tmpDir(), 'repo-miss');
  silentInit({ positional: [target], flags: { repo: 'api:src/api' }, jsonMode: true });
  // src/api を作らないまま doctor -> repo-registration error
  const { json } = captureDoctor(target);
  assert.equal(json.green, false);
  assert.ok(json.errors.some((f) => f.check === 'repo-registration'));
});

test('doctor は journal ref の解決不能を検出', () => {
  const target = path.join(tmpDir(), 'refmiss');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  // 実在しない spec:s404 を指す ref を持つ event
  append(target, {
    type: 'created',
    subject: 'campaign:c001',
    actor: { kind: 'agent' },
    refs: [{ rel: 'covers', to: 'spec:s404' }],
  });
  const { json } = captureDoctor(target);
  assert.ok(json.errors.some((f) => f.check === 'journal-refs' && /s404/.test(f.detail)));
});

test('doctor は guard_results に fail が焼き込まれた transitioned を検出', () => {
  const target = path.join(tmpDir(), 'guard');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  append(target, {
    type: 'transitioned',
    subject: 'spec:s001',
    actor: { kind: 'cli' },
    data: { from: 'draft', to: 'ready', guard_results: [{ name: 'sections', pass: false, detail: '空' }] },
  });
  const { json } = captureDoctor(target);
  assert.ok(json.errors.some((f) => f.check === 'guard-recalc'));
});
