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

// テスト用の src 側 git repo を作る。1 commit を積んで HEAD を成立させる。
// dirty=true の場合は commit 後に untracked ファイルを 1 つ残す。
function makeGitRepo(dir, { dirty = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const g = (args) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g(['init', '-q']);
  g(['config', 'user.name', 'test']);
  g(['config', 'user.email', 'test@local']);
  fs.writeFileSync(path.join(dir, 'README.md'), '# test\n');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'init']);
  const head = g(['rev-parse', 'HEAD']).trim();
  if (dirty) {
    // untracked ファイルを残して working tree を dirty にする。
    fs.writeFileSync(path.join(dir, 'dirty.txt'), 'x\n');
  }
  return head;
}

// baseline.recorded event を 1 件返す（無ければ null）。
function baselineEvent(root) {
  return readAll(root).find((e) => e.type === 'baseline.recorded') || null;
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

// --- 修正 2/3: refs パーサ一本化・frontmatter-refs の方向修正・decision 解決 ---

// 修正 2: 単一キー map 形式（- upstream: vision:v001）の frontmatter を authoring と
// 同一に正規化し、journal へ写像した ref と一致して doctor が誤検出しないこと。
test('doctor は単一キー map 形式 frontmatter の整合を通す（refs パーサ一本化）', () => {
  const target = path.join(tmpDir(), 'refs-map');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  // spec 本文の frontmatter は単一キー map 形（- upstream: vision:v001）で宣言する。
  write(
    target,
    path.join('specs', 's001-x', 'spec.md'),
    '---\nid: s001\nrefs:\n  - upstream: vision:v001\n---\n\n本文。\n'
  );
  // journal 側は authoring の遷移写像に相当する {rel,to} 正規形で同じ ref を持つ。
  append(target, {
    type: 'created',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    refs: [{ rel: 'upstream', to: 'vision:v001' }],
  });
  const { json } = captureDoctor(target);
  assert.ok(
    !json.errors.some((f) => f.check === 'frontmatter-refs'),
    `単一キー map 形は整合すべき（誤検出なし）: ${JSON.stringify(json.errors)}`
  );
});

// 修正 3: frontmatter で宣言された ref が journal に取り込まれていない（fm ⊆ journal 破れ）を
// error にする。逆方向（journal ⊆ frontmatter）は検査しない。
test('doctor は frontmatter 宣言 ref の journal 未取込（fm⊆journal 破れ）を検出', () => {
  const target = path.join(tmpDir(), 'refs-fm-only');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  // frontmatter は upstream vision:v001 を宣言するが journal には取り込まれていない。
  write(
    target,
    path.join('specs', 's001-x', 'spec.md'),
    '---\nid: s001\nrefs:\n  - { rel: upstream, to: vision:v001 }\n---\n\n本文。\n'
  );
  append(target, {
    type: 'created',
    subject: 'spec:s001',
    actor: { kind: 'agent' },
    // refs を焼かない = frontmatter 宣言が journal へ取り込まれていない状態。
  });
  const { json } = captureDoctor(target);
  assert.ok(
    json.errors.some((f) => f.check === 'frontmatter-refs' && /upstream:vision:v001/.test(f.detail)),
    `frontmatter 宣言 ref の未取込が error であるべき: ${JSON.stringify(json.errors)}`
  );
});

// 修正 3: tool 生成 refs（journal のみに在る approved-by 等）は fm に無くても不整合ではない。
test('doctor は journal のみに在る tool 生成 ref を不整合にしない（方向）', () => {
  const target = path.join(tmpDir(), 'refs-journal-only');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  // frontmatter は空 refs。journal 側だけ approved-by:decision:d001 を持つ（decide 由来を模す）。
  write(target, path.join('vision', 'v001-core.md'), '---\nid: v001\nrefs: []\n---\n\n本文。\n');
  append(target, { type: 'created', subject: 'vision:v001', actor: { kind: 'agent' } });
  append(target, { type: 'decision.recorded', subject: 'decision:d001', actor: { kind: 'human' }, data: {} });
  append(target, {
    type: 'transitioned',
    subject: 'vision:v001',
    actor: { kind: 'human' },
    data: {
      from: 'draft',
      to: 'approved',
      guard_results: [{ name: 'decision-recorded', pass: true, detail: 'decision:d001' }],
    },
    refs: [{ rel: 'approved-by', to: 'decision:d001' }],
  });
  const { json } = captureDoctor(target);
  assert.ok(
    !json.errors.some((f) => f.check === 'frontmatter-refs'),
    `journal のみの tool 生成 ref は不整合にしないべき: ${JSON.stringify(json.errors)}`
  );
});

// 修正 3: decision:<id> は authored file を持たず journal subject として解決される。
// approved-by:decision:d001 ref が journal-refs 解決不能にならないこと。
test('doctor は journal-native な decision ref を解決成功にする', () => {
  const target = path.join(tmpDir(), 'refs-decision');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  append(target, { type: 'decision.recorded', subject: 'decision:d001', actor: { kind: 'human' }, data: {} });
  append(target, {
    type: 'transitioned',
    subject: 'vision:v001',
    actor: { kind: 'human' },
    data: {
      from: 'draft',
      to: 'approved',
      guard_results: [{ name: 'decision-recorded', pass: true, detail: 'decision:d001' }],
    },
    refs: [{ rel: 'approved-by', to: 'decision:d001' }],
  });
  const { json } = captureDoctor(target);
  assert.ok(
    !json.errors.some((f) => f.check === 'journal-refs' && /decision:d001/.test(f.detail)),
    `decision:d001 は journal subject として解決されるべき: ${JSON.stringify(json.errors)}`
  );
});

// --- 実装 1: 導入時 baseline イベント（14 5.4 / 06 3.2） ---

test('init は baseline event を 1 件刻み data.repos が登録 repo と一致する（clean git repo は dirty=false）', () => {
  const base = tmpDir();
  const repoDir = path.join(base, 'src', 'api');
  const head = makeGitRepo(repoDir, { dirty: false });
  const target = path.join(base, 'proj');
  // repo path は project-context から src/api への相対で登録する（実体は base/src/api）。
  // init は path.resolve(target, r.path) で解決するため、target を base 配下に置き相対を合わせる。
  silentInit({ positional: [target], flags: { repo: `api:${path.relative(target, repoDir)}` }, jsonMode: true });

  const ev = baselineEvent(target);
  assert.ok(ev, 'baseline.recorded event が 1 件存在する');
  assert.equal(ev.subject, 'project:root');
  assert.equal(ev.actor.kind, 'cli');
  assert.equal(ev.data.repos.length, 1);
  const r = ev.data.repos[0];
  assert.equal(r.name, 'api');
  assert.equal(r.head, head, 'head が実 HEAD sha と一致する');
  assert.equal(r.dirty, false, 'clean な git repo は dirty=false');
});

test('init の baseline は dirty な git repo を dirty=true と記録する', () => {
  const base = tmpDir();
  const repoDir = path.join(base, 'src', 'api');
  const head = makeGitRepo(repoDir, { dirty: true });
  const target = path.join(base, 'proj');
  silentInit({ positional: [target], flags: { repo: `api:${path.relative(target, repoDir)}` }, jsonMode: true });

  const ev = baselineEvent(target);
  const r = ev.data.repos[0];
  assert.equal(r.head, head);
  assert.equal(r.dirty, true, 'untracked ファイルがあれば dirty=true');
});

test('init の baseline は非 git ディレクトリ登録で head=null / dirty=null', () => {
  const base = tmpDir();
  const repoDir = path.join(base, 'src', 'plain');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'x\n');
  const target = path.join(base, 'proj');
  silentInit({ positional: [target], flags: { repo: `plain:${path.relative(target, repoDir)}` }, jsonMode: true });

  const ev = baselineEvent(target);
  const r = ev.data.repos[0];
  assert.equal(r.name, 'plain');
  assert.equal(r.head, null, '非 git は head=null');
  assert.equal(r.dirty, null, '非 git は dirty=null');
});

test('init は登録 repo が 0 件でも baseline event を刻む（data.repos=[]）', () => {
  const target = path.join(tmpDir(), 'no-repo');
  silentInit({ positional: [target], flags: {}, jsonMode: true });
  const ev = baselineEvent(target);
  assert.ok(ev, 'repo 0 件でも baseline event が存在する');
  assert.deepEqual(ev.data.repos, []);
});

// --- 実装 2: doctor の adoption-baseline 検査（14 5.4 / 08 3.3） ---

test('doctor: baseline event の無い旧 project-context は warning を出すが green（exit 0）のまま', () => {
  const base = tmpDir();
  const repoDir = path.join(base, 'src', 'api');
  makeGitRepo(repoDir, { dirty: false });
  const target = path.join(base, 'proj');
  silentInit({ positional: [target], flags: { repo: `api:${path.relative(target, repoDir)}` }, jsonMode: true });

  // baseline event を意図的に削除して「旧 project-context」を再現する。
  const journalDir = path.join(target, 'journal');
  for (const f of fs.readdirSync(journalDir)) {
    const raw = JSON.parse(fs.readFileSync(path.join(journalDir, f), 'utf8'));
    if (raw.type === 'baseline.recorded') fs.rmSync(path.join(journalDir, f));
  }

  const { json, exitCode } = captureDoctor(target);
  assert.equal(json.green, true, JSON.stringify(json.errors));
  assert.equal(exitCode, 0);
  assert.ok(
    json.warnings.some((f) => f.check === 'adoption-baseline' && /baseline がありません/.test(f.detail)),
    `baseline 欠落は warning であるべき: ${JSON.stringify(json.warnings)}`
  );
});

test('doctor: baseline で dirty=true と記録された repo は warning（green のまま）', () => {
  const base = tmpDir();
  const repoDir = path.join(base, 'src', 'api');
  makeGitRepo(repoDir, { dirty: true });
  const target = path.join(base, 'proj');
  silentInit({ positional: [target], flags: { repo: `api:${path.relative(target, repoDir)}` }, jsonMode: true });

  const { json, exitCode } = captureDoctor(target);
  assert.equal(json.green, true, JSON.stringify(json.errors));
  assert.equal(exitCode, 0);
  assert.ok(
    json.warnings.some((f) => f.check === 'adoption-baseline' && /dirty/.test(f.detail)),
    `導入時 dirty は warning であるべき: ${JSON.stringify(json.warnings)}`
  );
});

test('doctor: baseline 完備・clean 記録なら adoption-baseline warning はゼロ', () => {
  const base = tmpDir();
  const repoDir = path.join(base, 'src', 'api');
  makeGitRepo(repoDir, { dirty: false });
  const target = path.join(base, 'proj');
  silentInit({ positional: [target], flags: { repo: `api:${path.relative(target, repoDir)}` }, jsonMode: true });

  const { json, exitCode } = captureDoctor(target);
  assert.equal(exitCode, 0);
  assert.ok(
    !json.warnings.some((f) => f.check === 'adoption-baseline'),
    `baseline 完備・clean なら adoption-baseline warning は出ないべき: ${JSON.stringify(json.warnings)}`
  );
});
