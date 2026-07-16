import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run as sessionRun } from '../lib/commands/session.js';
import { run as runRun } from '../lib/commands/run.js';
import { readAll } from '../lib/journal.js';
import { derive } from '../lib/state.js';
import { initProjectContext } from '../lib/gitops.js';
import { write } from '../lib/writePath.js';
import { Refusal } from '../lib/refuse.js';

// --- test harness ---

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sess-'));
  initProjectContext(root);
  fs.mkdirSync(path.join(root, 'journal'), { recursive: true });
  write(root, 'cc-iasd.yaml', 'doc_lang: Japanese\n');
  write(root, path.join('roles', 'worker.md'), '# worker\n出力言語は Japanese。src/ のみ編集する。\n');
  return root;
}

function snap(root) {
  return derive(readAll(root));
}

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

// handed-off まで進めた adhoc run を開く。
async function openAdhoc(root, goal = '調査') {
  const opened = await capture(() =>
    runRun({ positional: ['open'], flags: { adhoc: goal, check: 'node -e "process.exit(0)"' }, root })
  );
  return opened.ret;
}

// --- session start: bundle.md 生成 + session.started（adapter=none 既定） ---

test('session start は bundle.md を生成し session.started を記録する（none）', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);

  const res = await capture(() =>
    sessionRun({ positional: ['start', runId], flags: {}, root })
  );
  // out/<run-id>/bundle.md が生成される。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'bundle.md')));
  const bundle = fs.readFileSync(path.join(root, 'out', runId, 'bundle.md'), 'utf8');
  assert.match(bundle, /## handoff/);
  assert.match(bundle, /## worker role card/);
  assert.match(bundle, /runtime adapter: none/);
  // launch.json も生成される。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'launch.json')));

  // session.started event が刻まれる。
  const events = readAll(root);
  const started = events.filter((e) => e.type === 'session.started' && e.subject === `run:${runId}`);
  assert.equal(started.length, 1);
  assert.equal(started[0].data.runtime, 'none');
  assert.equal(started[0].data.bundleDir, `out/${runId}`);

  // 人間可読出力に手順案内が出る（none は自動起動しない）。
  assert.match(res.out, /session started/);
  assert.match(res.out, /adapter=none/);
  assert.match(res.out, /run return/);
});

// --- session start: base commit を commit.observed で記録する ---

test('session start は起動時点 HEAD を commit.observed で記録する', async () => {
  const root = tmpRoot();
  // src 側 repo を用意して config に登録する。
  const repoPath = path.join(root, 'src', 'api');
  fs.mkdirSync(repoPath, { recursive: true });
  initProjectContext(repoPath); // git init
  fs.writeFileSync(path.join(repoPath, 'a.txt'), 'x');
  const { _git } = await import('../lib/gitops.js');
  _git(repoPath, ['add', '-A']);
  _git(repoPath, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init']);
  write(root, 'cc-iasd.yaml', 'doc_lang: Japanese\nrepos:\n  - { name: api, path: src/api }\n');

  // surface に src/api を含めて open（campaign 不要の adhoc は surface フラグで write 面を持たせる）。
  const opened = await capture(() =>
    runRun({
      positional: ['open'],
      flags: { adhoc: 'api 修正', check: 'node -e "process.exit(0)"', surface: 'src/api/**' },
      root,
    })
  );
  const runId = opened.ret;

  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));

  const events = readAll(root);
  const observed = events.filter(
    (e) => e.type === 'commit.observed' && e.subject === `run:${runId}`
  );
  assert.equal(observed.length, 1);
  assert.ok(observed[0].data.repos.api);
  // state に畳み込まれ run.repos.api が観測 HEAD になる。
  const head = _git(repoPath, ['rev-parse', 'HEAD']).trim();
  assert.equal(snap(root).runs[runId].repos.api, head);
});

// --- session start: created（handoff 未合成）は起動不可 ---

test('session start は created 状態の run を拒否する', async () => {
  const root = tmpRoot();
  // created のみの run を journal 直書きで作る（handoff 未合成）。
  const { append } = await import('../lib/journal.js');
  append(root, {
    type: 'created',
    subject: 'run:r-created-only',
    actor: { kind: 'cli' },
    data: { type: 'normal', repos: {} },
  });
  await assert.rejects(
    () => capture(() => sessionRun({ positional: ['start', 'r-created-only'], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'run-state'));
      return true;
    }
  );
});

// --- session start: 存在しない run は拒否 ---

test('session start は存在しない run を拒否する', async () => {
  const root = tmpRoot();
  await assert.rejects(
    () => capture(() => sessionRun({ positional: ['start', 'r-nope'], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'run'));
      return true;
    }
  );
});

// --- session start: STOP ファイルで拒否 ---

test('session start は STOP ファイル存在で拒否する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  write(root, path.join('runs', runId, 'STOP'), 'stop\n');
  await assert.rejects(
    () => capture(() => sessionRun({ positional: ['start', runId], flags: {}, root })),
    (e) => {
      assert.ok(e.missing.some((m) => m.input === 'stop-file'));
      return true;
    }
  );
});

// --- session start: --runtime claude-code は settings/hook を生成する ---

test('session start --runtime claude-code は settings/hook を生成する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  const res = await capture(() =>
    sessionRun({ positional: ['start', runId], flags: { runtime: 'claude-code' }, root })
  );
  // settings.json と write-guard hook が生成される。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'settings', 'settings.json')));
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'settings', 'write-guard.mjs')));
  // session.started の runtime が claude-code。
  const started = readAll(root).find(
    (e) => e.type === 'session.started' && e.subject === `run:${runId}`
  );
  assert.equal(started.data.runtime, 'claude-code');
  // launch.json に起動コマンドが入る。
  const launch = JSON.parse(fs.readFileSync(path.join(root, 'out', runId, 'launch.json'), 'utf8'));
  assert.equal(launch.runtime, 'claude-code');
  assert.match(launch.command, /claude --settings/);
  // 人間可読に起動コマンド案内。
  assert.match(res.out, /adapter=claude-code/);
});

// --- session resume: 未起動 run は拒否 ---

test('session resume は未起動 run（session.started 無し）を拒否する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await assert.rejects(
    () => capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'session'));
      assert.ok(e.next.some((n) => n.includes('session start')));
      return true;
    }
  );
});

// --- session resume: start 後は resume-brief.md + session.resumed ---

test('session resume は resume-brief.md を生成し session.resumed を記録する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));

  const res = await capture(() =>
    sessionRun({ positional: ['resume', runId], flags: {}, root })
  );
  // resume-brief.md が生成される。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'resume-brief.md')));
  const brief = fs.readFileSync(path.join(root, 'out', runId, 'resume-brief.md'), 'utf8');
  assert.match(brief, /resume brief/);
  assert.match(brief, /base からの差分概要/);
  assert.match(brief, /最終 verification/);

  // session.resumed event が刻まれる。
  const resumed = readAll(root).filter(
    (e) => e.type === 'session.resumed' && e.subject === `run:${runId}`
  );
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].data.bundleDir, `out/${runId}`);
  assert.match(res.out, /session resumed/);

  // resume は run.status を進めない（05 10 章。state.js は session 系を畳み込まない）。
  assert.equal(snap(root).runs[runId].status, 'handed-off');
});

// --- session resume: bundle.md に resume brief が連結される（none） ---

test('session resume は bundle.md に resume brief を連結する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));
  const bundle = fs.readFileSync(path.join(root, 'out', runId, 'bundle.md'), 'utf8');
  assert.match(bundle, /## resume brief/);
});

// --- session resume: 入力ハッシュ prefix キャッシュ（束2） ---

// start は session.started.data に inputHashes（監査用）を焼く。
test('session start は inputHashes を session.started に記録する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));

  const started = readAll(root).find(
    (e) => e.type === 'session.started' && e.subject === `run:${runId}`
  );
  assert.ok(started.data.inputHashes, 'inputHashes が焼かれること');
  // 4 項目（handoff / roleCard / reposBase / config）が揃う。
  assert.deepEqual(
    Object.keys(started.data.inputHashes).sort(),
    ['config', 'handoff', 'reposBase', 'roleCard']
  );
});

// 初回 resume は prev=null（直近 resumed 無し）のため必ず compile する。
test('session resume 初回は compile を実行する（changedInputs=no-prior-hashes）', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));

  const resumed = readAll(root).filter(
    (e) => e.type === 'session.resumed' && e.subject === `run:${runId}`
  );
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].data.compileReused, false);
  assert.deepEqual(resumed[0].data.changedInputs, ['(no-prior-hashes)']);
  // compile-cache hit の note は無い（compile 実行経路）。
  const cacheNotes = readAll(root).filter(
    (e) => e.type === 'note.appended' && e.data && e.data.kind === 'compile-cache'
  );
  assert.equal(cacheNotes.length, 0);
});

// 入力不変の 2 回目 resume は compile を skip する（cache hit）。
test('session resume 2回目（入力不変）は compile を再利用する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));
  // 2 回目 resume（入力不変）。
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));

  const resumed = readAll(root).filter(
    (e) => e.type === 'session.resumed' && e.subject === `run:${runId}`
  );
  assert.equal(resumed.length, 2);
  const last = resumed[resumed.length - 1];
  assert.equal(last.data.compileReused, true, '2 回目は再利用');
  assert.deepEqual(last.data.changedInputs, [], '変化した入力は無い');
  // compile-cache hit の note が刻まれる。
  const cacheNotes = readAll(root).filter(
    (e) =>
      e.type === 'note.appended' &&
      e.subject === `run:${runId}` &&
      e.data &&
      e.data.kind === 'compile-cache' &&
      e.data.hit === true
  );
  assert.equal(cacheNotes.length, 1);
  assert.equal(cacheNotes[0].data.run, runId);
});

// handoff 編集後の resume は変化を検出して再 compile する。
test('session resume は handoff 編集を検出して再 compile する（changedInputs=handoff）', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));

  // handoff.md を編集する（一意なマーカーを埋め込む）。
  const marker = 'HANDOFF-CHANGED-MARKER-9f3a';
  const handoffPath = path.join(root, 'runs', runId, 'handoff.md');
  fs.appendFileSync(handoffPath, `\n\n${marker}\n`);

  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));

  const resumed = readAll(root).filter(
    (e) => e.type === 'session.resumed' && e.subject === `run:${runId}`
  );
  const last = resumed[resumed.length - 1];
  assert.equal(last.data.compileReused, false, 'handoff 変化のため再 compile');
  assert.deepEqual(last.data.changedInputs, ['handoff']);
  // 再 compile された bundle.md に新 handoff のマーカーが反映される。
  const bundle = fs.readFileSync(path.join(root, 'out', runId, 'bundle.md'), 'utf8');
  assert.match(bundle, new RegExp(marker));
  // resume-brief.md の「compile 入力の変化」節に handoff が列挙される。
  const brief = fs.readFileSync(path.join(root, 'out', runId, 'resume-brief.md'), 'utf8');
  assert.match(brief, /## compile 入力の変化/);
  assert.match(brief, /- handoff/);
});

// reuse 時の resume-brief には「変化なし（bundle 再利用）」が出る。
test('session resume 再利用時の brief は変化なしを明記する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));

  const brief = fs.readFileSync(path.join(root, 'out', runId, 'resume-brief.md'), 'utf8');
  assert.match(brief, /## compile 入力の変化/);
  assert.match(brief, /変化なし（bundle 再利用）/);
});

// claude-code の reuse は settings/* も compiled.files に復元する。
test('session resume 2回目（claude-code・入力不変）は settings を復元し再利用する', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() =>
    sessionRun({ positional: ['start', runId], flags: { runtime: 'claude-code' }, root })
  );
  await capture(() =>
    sessionRun({ positional: ['resume', runId], flags: { runtime: 'claude-code' }, root })
  );
  const res = await capture(() =>
    sessionRun({
      positional: ['resume', runId],
      flags: { runtime: 'claude-code', json: true },
      root,
      jsonMode: true,
    })
  );
  const obj = JSON.parse(res.out.trim());
  // compile を再利用しても compiled.files に settings/* が復元される。
  assert.ok(obj.files.some((f) => f.endsWith('bundle.md')));
  assert.ok(obj.files.some((f) => f.endsWith(path.join('settings', 'settings.json'))));
  assert.ok(obj.files.some((f) => f.endsWith(path.join('settings', 'write-guard.mjs'))));

  const resumed = readAll(root).filter(
    (e) => e.type === 'session.resumed' && e.subject === `run:${runId}`
  );
  assert.equal(resumed[resumed.length - 1].data.compileReused, true);
});

// runtime（adapter）を変えた resume は config 変化を検出して再 compile する。
test('session resume は adapter 変更を検出して再 compile する（changedInputs=config）', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  await capture(() => sessionRun({ positional: ['start', runId], flags: {}, root }));
  await capture(() => sessionRun({ positional: ['resume', runId], flags: {}, root }));
  // runtime を claude-code に切り替えて resume する。
  await capture(() =>
    sessionRun({ positional: ['resume', runId], flags: { runtime: 'claude-code' }, root })
  );

  const resumed = readAll(root).filter(
    (e) => e.type === 'session.resumed' && e.subject === `run:${runId}`
  );
  const last = resumed[resumed.length - 1];
  assert.equal(last.data.compileReused, false);
  assert.ok(last.data.changedInputs.includes('config'));
  // 再 compile により claude-code の settings が生成される。
  assert.ok(fs.existsSync(path.join(root, 'out', runId, 'settings', 'settings.json')));
});

// --- session: 未知サブコマンドは拒否 ---

test('session は未知サブコマンドを拒否する', async () => {
  const root = tmpRoot();
  await assert.rejects(
    () => capture(() => sessionRun({ positional: ['frobnicate'], flags: {}, root })),
    (e) => {
      assert.ok(e instanceof Refusal);
      assert.ok(e.missing.some((m) => m.input === 'subcommand'));
      return true;
    }
  );
});

// --- session start: --json 出力 ---

test('session start --json は機械可読オブジェクトを出す', async () => {
  const root = tmpRoot();
  const runId = await openAdhoc(root);
  // dispatcher は jsonMode = !!flags.json を別引数で渡す。ここでは直接指定する。
  const res = await capture(() =>
    sessionRun({ positional: ['start', runId], flags: { json: true }, root, jsonMode: true })
  );
  const obj = JSON.parse(res.out.trim());
  assert.equal(obj.ok, true);
  assert.equal(obj.command, 'session start');
  assert.equal(obj.run, runId);
  assert.equal(obj.runtime, 'none');
  assert.ok(Array.isArray(obj.files));
});
