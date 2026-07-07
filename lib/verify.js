import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { evidenceVerificationsDir } from './paths.js';
import { write } from './writePath.js';
import { sha256 } from './hash.js';
import { diffNames, diffPatch } from './gitops.js';

// --- glob matcher（** / * / ? のみ。POSIX 風パス） ---
function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++;
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function matchGlob(glob, filePath) {
  return globToRegExp(glob).test(filePath);
}

function matchAny(globs, filePath) {
  return (globs || []).some((g) => matchGlob(g, filePath));
}

// --- repo 単位 lockfile 直列化 ---
function acquireLock(root, repoName) {
  const lockPath = path.join(root, 'evidence', 'verifications', `.lock-${repoName}`);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 30000;
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return lockPath;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (Date.now() > deadline) {
        throw new Error(`verify lock 取得タイムアウト: ${repoName}`);
      }
      spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},50)'], { timeout: 200 });
    }
  }
}

function releaseLock(lockPath) {
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    /* noop */
  }
}

// 単純なコマンド分割（引用符対応）。shell は使わない。
function splitCommand(command) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(command))) !== null) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

// Checks を子プロセス実行し exit code を expect と照合する。
// check: { id, run: "<argv0> arg...", cwd: "<rel-to-root>", expect:{exit} }
export function runCheck(root, check) {
  const resolvedCwd = check.cwd
    ? path.isAbsolute(check.cwd)
      ? check.cwd
      : path.resolve(root, check.cwd)
    : root;
  const argv = splitCommand(check.run);
  const cmd = argv[0];
  const args = argv.slice(1);
  const res = spawnSync(cmd, args, {
    cwd: resolvedCwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = res.status == null ? -1 : res.status;
  const expectExit = check.expect && Number.isFinite(check.expect.exit) ? check.expect.exit : 0;
  return {
    id: check.id,
    run: check.run,
    cwd: check.cwd || '.',
    exit,
    expect: expectExit,
    pass: exit === expectExit && res.error == null,
    stdout: res.stdout || '',
    stderr: res.stderr || (res.error ? String(res.error.message) : ''),
  };
}

// verify を実行する。
// opts: {
//   checks: [...],
//   surfaces: { write:[glob...], forbid:[glob...] },  // src/<repo>/ プレフィックス込み
//   repos: { name: { path, base } },
// }
// 戻り値: { pass, checks:[...], surface:{ offSurface:[], forbidden:[] }, ... }
export function run(root, runId, opts = {}) {
  const { checks = [], surfaces = { write: [], forbid: [] }, repos = {} } = opts;

  const repoNames = Object.keys(repos).sort();
  const locks = [];
  const checkResults = [];
  const offSurface = [];
  const forbidden = [];
  const patches = {};

  try {
    for (const name of repoNames) locks.push(acquireLock(root, name));

    for (const c of checks) {
      checkResults.push(runCheck(root, c));
    }

    for (const [name, info] of Object.entries(repos)) {
      const repoPath = info.path;
      const base = info.base;
      let changed = [];
      try {
        changed = diffNames(repoPath, base);
        patches[name] = diffPatch(repoPath, base);
      } catch (e) {
        patches[name] = `diff 取得失敗: ${e.message}`;
      }
      for (const rel of changed) {
        const surfacePath = `src/${name}/${rel}`;
        if (matchAny(surfaces.forbid, surfacePath)) {
          forbidden.push(surfacePath);
        } else if (matchAny(surfaces.write, surfacePath)) {
          // 想定内。列挙しない。
        } else {
          offSurface.push(surfacePath);
        }
      }
    }
  } finally {
    for (const l of locks) releaseLock(l);
  }

  const checksPass = checkResults.every((c) => c.pass);
  const surfacePass = forbidden.length === 0; // forbid 該当は機械 FAIL
  const pass = checksPass && surfacePass;

  const verdict = {
    runId,
    pass,
    checks: checkResults,
    surface: { offSurface, forbidden },
  };

  const relDir = path.join('evidence', 'verifications', runId);
  write(root, path.join(relDir, 'verdict.json'), JSON.stringify(verdict, null, 2) + '\n');
  for (const c of checkResults) {
    const safe = String(c.id).replace(/[^a-zA-Z0-9._-]/g, '_');
    write(root, path.join(relDir, `${safe}.stdout.txt`), c.stdout);
    write(root, path.join(relDir, `${safe}.stderr.txt`), c.stderr);
  }
  for (const [name, patch] of Object.entries(patches)) {
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    write(root, path.join(relDir, `${safe}.diff.patch`), patch);
  }

  const payloadSha = sha256(JSON.stringify(verdict));

  return { ...verdict, payloadSha, evidenceDir: evidenceVerificationsDir(root, runId) };
}
