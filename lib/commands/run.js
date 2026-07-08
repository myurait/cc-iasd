import fs from 'node:fs';
import path from 'node:path';
import { readAll, append, subjectId } from '../journal.js';
import { derive, blockingGapsFor } from '../state.js';
import { load as loadConfig } from '../config.js';
import { attempt } from '../transitions.js';
import { synthesize, extractSection } from '../handoff.js';
import { run as runVerify, matchGlob } from '../verify.js';
import { write } from '../writePath.js';
import { refuse } from '../refuse.js';
import { ulid, slugify } from '../ulid.js';
import {
  baseCommit,
  isGitRepo,
  autoCommit,
  diffNames,
  worktreeAdd,
  worktreeRemove,
  worktreeMerge,
  worktreeMergeDryRun,
  currentBranch,
} from '../gitops.js';
import { contentHash } from '../hash.js';
import { rolesDir, runDir, outDir } from '../paths.js';

// run コマンド束。open / handoff / return / verify / accept / block / escalate。
// dispatcher 規約: run({ command, positional, flags, root, jsonMode })。
export async function run(args) {
  const { positional, flags, root, jsonMode } = args;
  if (!root) {
    throw refuse(
      'run',
      [{ input: 'project-context', detail: 'journal/ を持つ root が見つかりません' }],
      ['cc-iasd init']
    );
  }
  const sub = positional[0];
  const runIdArg = positional[1];

  switch (sub) {
    case 'open':
      return cmdOpen(root, positional, flags, jsonMode);
    case 'handoff':
      return cmdHandoff(root, runIdArg, jsonMode);
    case 'return':
      return cmdReturn(root, runIdArg, jsonMode);
    case 'verify':
      return cmdVerify(root, runIdArg, jsonMode);
    case 'accept':
      return cmdAccept(root, runIdArg, jsonMode);
    case 'block':
      return cmdBlock(root, runIdArg, flags, jsonMode);
    case 'escalate':
      return cmdEscalate(root, runIdArg, flags, jsonMode);
    default:
      throw refuse(
        'run',
        [{ input: 'subcommand', detail: `未知の run サブコマンド: ${sub || '(なし)'}` }],
        ['cc-iasd run open --adhoc "<goal>" --check "<cmd>"']
      );
  }
}

// --- 共通ヘルパ ---

// run 系成功出力の統一。--json 時は単一 JSON オブジェクトのみ stdout に出す
// （既存 JSON 対応コマンドの規約に合わせ { ok:true, command, ... }）。
// 人間可読時は humanText をそのまま出す（--json なしの挙動は不変）。
// 返り値は呼び出し元がそのまま return して既存テストの ret 依存を保つ。
function emit(jsonMode, humanText, jsonObj) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(jsonObj) + '\n');
  } else {
    process.stdout.write(humanText);
  }
}

const ACTIVE_STATES = new Set(['created', 'handed-off', 'returned', 'verified']);

function loadSnapshot(root) {
  return derive(readAll(root));
}

// runs/<run-id>/<file> の本文（frontmatter / コメント除去後）が非空かを判定する。
function fileNonEmpty(root, runId, name) {
  const body = stripBody(readRunFile(root, runId, name));
  return body != null && body.length > 0;
}

function stripBody(text) {
  if (text == null) return null;
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

function readRunFile(root, runId, name) {
  const p = path.join(runDir(root, runId), name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// <area>/ 直下で "<id>" もしくは "<id>-*" のディレクトリ名を解決する。
// authoring は scaffold を "<id>-<slug>/" で作るため、run 側も同じ規則で引く。
function resolveSeqDir(root, area, id) {
  const dir = path.join(root, area);
  if (fs.existsSync(dir)) {
    for (const d of fs.readdirSync(dir).sort()) {
      if (d === id || d.startsWith(`${id}-`)) return d;
    }
  }
  return id;
}
function readSpecBody(root, specId) {
  const p = path.join(root, 'specs', resolveSeqDir(root, 'specs', specId), 'spec.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function readCharterBody(root, campaignId) {
  const p = path.join(root, 'campaigns', resolveSeqDir(root, 'campaigns', campaignId), 'charter.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function readVisionBody(root) {
  const dir = path.join(root, 'vision');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
  return files.length ? fs.readFileSync(path.join(dir, files[0]), 'utf8') : null;
}
function readWorkerRole(root) {
  const p = path.join(rolesDir(root), 'worker.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// spec の Surfaces から write/forbid glob を抽出する。
// 記法: text block 内の `write: [...]` / `forbid: [...]`。
export function parseSurfaces(specBody) {
  const sec = extractSection(specBody, 'Surfaces');
  const out = { write: [], forbid: [] };
  if (!sec) return out;
  for (const key of ['write', 'forbid']) {
    const m = new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(sec);
    if (m) {
      out[key] = m[1]
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .filter((s) => s.length > 0);
    }
  }
  return out;
}

// spec の Checks（または charter の Cross-Checks）から check 群を抽出する。
// 記法: `- id: <id> ; run: "<cmd>" ; cwd: <rel> ; expect: { exit: N }`
// sectionName で節名を切り替える（既定 'Checks'。campaign close は 'Cross-Checks'）。
export function parseChecks(body, sectionName = 'Checks') {
  const sec = extractSection(body, sectionName);
  const checks = [];
  if (!sec) return checks;
  for (const raw of sec.split('\n')) {
    const line = raw.replace(/^\s*-\s*/, '').trim();
    if (!line || !/(^|;\s*)id\s*:/.test(line)) continue;
    const fields = {};
    for (const part of line.split(';')) {
      const kv = /^\s*([a-zA-Z]+)\s*:\s*(.*)$/.exec(part);
      if (kv) fields[kv[1]] = kv[2].trim();
    }
    if (!fields.run) continue;
    let exit = 0;
    if (fields.expect) {
      const e = /exit\s*:\s*(-?\d+)/.exec(fields.expect);
      if (e) exit = parseInt(e[1], 10);
    }
    checks.push({
      id: fields.id ? fields.id.replace(/^["']|["']$/g, '') : `c${checks.length}`,
      run: fields.run.replace(/^["']|["']$/g, ''),
      cwd: fields.cwd ? fields.cwd.replace(/^["']|["']$/g, '') : '.',
      expect: { exit },
    });
  }
  return checks;
}

// Surfaces の glob から対象 repo 名集合を導出する（src/<repo>/... プレフィックス）。
function reposFromSurfaces(surfaces) {
  const names = new Set();
  for (const g of [...(surfaces.write || []), ...(surfaces.forbid || [])]) {
    const m = /^src\/([^/*]+)\//.exec(g);
    if (m) names.add(m[1]);
  }
  return [...names];
}

// config の repos を name->{path,base} に解決する。nested git のみ base を取得する。
function resolveRepos(root, cfg, wantNames) {
  const map = {};
  for (const r of cfg.repos || []) {
    if (wantNames && wantNames.length > 0 && !wantNames.includes(r.name)) continue;
    const repoPath = path.isAbsolute(r.path) ? r.path : path.resolve(root, r.path);
    let base = null;
    if (isGitRepo(repoPath)) {
      try {
        base = baseCommit(repoPath);
      } catch {
        base = null;
      }
    }
    map[r.name] = { path: repoPath, base };
  }
  return map;
}

// STOP ファイル（runs/<id>/STOP）検出。
function stopFileExists(root, runId) {
  return fs.existsSync(path.join(runDir(root, runId), 'STOP'));
}

function findCreated(root, runId) {
  return readAll(root).find((e) => e.type === 'created' && e.subject === `run:${runId}`) || null;
}

// created.data.worktree（run open で焼いた worktree 記述）を返す。無ければ null。
// 形: { <repo>: { repo, path, branch, base, baseBranch } }。
function worktreeMapOf(root, runId) {
  const created = findCreated(root, runId);
  const wt = created && created.data && created.data.worktree;
  return wt && typeof wt === 'object' ? wt : null;
}

// resolveRepos の結果 map の各 repo.path を、worktree run なら worktree path へ差し替える。
// diff snapshot / verify checks cwd / surface 照合が worktree 内で走るようにする。
// 非 worktree run では resolved をそのまま返す（挙動維持）。
function applyWorktreePaths(resolved, wtMap) {
  if (!wtMap) return resolved;
  const out = {};
  for (const [name, info] of Object.entries(resolved)) {
    const wt = wtMap[name];
    out[name] = wt && wt.path ? { ...info, path: wt.path } : info;
  }
  return out;
}

function autoCommitSafe(root, message) {
  try {
    autoCommit(root, message);
  } catch {
    // git 未初期化（テスト環境等）は致命ではない。
  }
}

// --- run open ---

function cmdOpen(root, positional, flags, jsonMode) {
  const cfg = loadConfig(root);
  const snap = loadSnapshot(root);

  const adhocGoal = typeof flags.adhoc === 'string' ? flags.adhoc : null;
  const spike = !!flags.spike;
  const campaignId = positional[1] && !positional[1].startsWith('-') ? positional[1] : null;
  const tasks =
    typeof flags.tasks === 'string'
      ? flags.tasks.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
  const checkCmd = typeof flags.check === 'string' ? flags.check : null;
  const surfaceGlob = typeof flags.surface === 'string' ? flags.surface : null;
  // worktree 隔離: --worktree（契約）/ --isolate（補足）のいずれかで有効化する。
  // spike は src 不変（09 4.3 / 08 8.2）のため隔離しない。
  const wantWorktree = (!!flags.worktree || !!flags.isolate) && !spike;

  if (!adhocGoal && !campaignId) {
    throw refuse(
      'run open',
      [{ input: 'mode', detail: '--adhoc "<goal>" または <campaign-id> --tasks <T..> が必要です' }],
      ['cc-iasd run open --adhoc "<goal>" --check "<cmd>"']
    );
  }

  const missing = [];
  const guards = [];
  let surfaces = { write: [], forbid: [] };
  let specBody = null;
  let campSpecId = null;
  let charterBody = null;
  let visionBody = null;
  const decisions = [];

  if (adhocGoal) {
    // adhoc は campaign active 不要。goal 必須、spike 以外は check 必須。
    if (!spike && !checkCmd) {
      missing.push({ input: 'adhoc.check', detail: '--check "<cmd>" が必要です（spike を除く）' });
    }
    surfaces = spike
      ? { write: [], forbid: [] }
      : { write: surfaceGlob ? [surfaceGlob] : [], forbid: [] };
  } else {
    // campaign 由来: active / task 未完 claim / coverage 順序制約。
    const campNode = snap.nodes[`campaign:${campaignId}`];
    guards.push(() => ({
      name: 'campaign-active',
      pass: !!campNode && campNode.status === 'active',
      detail: campNode ? `campaign 状態=${campNode.status}` : 'campaign が存在しません',
    }));
    if (tasks.length === 0) {
      missing.push({ input: '--tasks', detail: 'campaign 由来 run は --tasks <T..> が必要です' });
    }
    guards.push(() => claimGuard(snap, campaignId, tasks));

    // 対象 spec（要求 task の所有者）を先に確定し、coverage 順序制約を対象 spec に絞る。
    campSpecId = resolveTargetSpec(root, campaignId, tasks);
    guards.push(() => coverageOrderGuard(root, snap, campaignId, campSpecId));

    if (campSpecId) {
      specBody = readSpecBody(root, campSpecId);
      if (specBody) surfaces = parseSurfaces(specBody);
      const blockers = blockingGapsFor(snap, `spec:${campSpecId}`);
      if (blockers.length > 0) {
        missing.push({
          input: `spec:${campSpecId}`,
          detail: `blocking gap が open: ${blockers.join(', ')}`,
        });
      }
    }
    charterBody = readCharterBody(root, campaignId);
    visionBody = readVisionBody(root);
  }

  // 停止条件 / 排他ガード（すべて決定論）。
  guards.push(() => noProgressGuard(snap, cfg));
  guards.push(() => budgetGuard(cfg));
  guards.push(() => writeGlobCrossGuard(snap, surfaces));

  // 上流欠落は handoff 合成で判定する（合成成功が run open ガードの入力）。
  const roleCard = readWorkerRole(root);
  const synthArgs = adhocGoal
    ? {
        adhoc: { goal: adhocGoal, check: checkCmd },
        spike,
        roleCard: roleCard || '',
        docLang: cfg.doc_lang,
      }
    : {
        spec: specBody,
        charter: charterBody,
        vision: visionBody,
        decisions,
        roleCard: roleCard || '',
        tasks,
        docLang: cfg.doc_lang,
        spike,
      };
  const probe = synthesize({ ...synthArgs, runId: 'pending', repos: {} });
  if (!probe.ok) {
    for (const m of probe.missing) {
      if (!missing.some((x) => x.input === m.input)) missing.push(m);
    }
  }

  // 遷移ガードを created 追記の前に dry-run する。失敗ガードは missing へ畳み、
  // refuse を created 追記より前に起こす。これにより拒否された run open が
  // 幽霊 created run（task を claim し write glob を占有する）を残さない。
  // 全 pass なら後段の attempt が同じ guards を再評価し guard_results を焼き込む。
  for (const g of guards) {
    let r;
    try {
      r = g();
    } catch (e) {
      r = { name: 'guard', pass: false, detail: `例外: ${e.message}` };
    }
    if (r && r.pass === false && !missing.some((x) => x.input === r.name)) {
      missing.push({ input: r.name, detail: r.detail || '不成立' });
    }
  }

  if (missing.length > 0) {
    throw refuse('run open', missing, [
      'cc-iasd gap add <ref> / cc-iasd decide <id>（上流不足の解消）',
      'cc-iasd run block <run-id> --missing <ref>（差し戻し）',
    ]);
  }

  // 対象 repo と base commit を確定する。
  const wantRepos = adhocGoal ? [] : reposFromSurfaces(surfaces);
  const resolved = resolveRepos(root, cfg, wantRepos.length ? wantRepos : null);
  const reposBase = {};
  for (const [name, info] of Object.entries(resolved)) {
    reposBase[name] = info.base || 'UNCOMMITTED';
  }

  const runId = `r-${ulid()}-${slugify(adhocGoal || campaignId || 'run')}`.slice(0, 60);
  const subject = `run:${runId}`;

  // created event に再構成情報（type / campaign / spec / tasks / repos / surface / checks）を焼込む。
  const createdData = { type: spike ? 'spike' : 'normal', repos: reposBase, surface: surfaces };
  if (adhocGoal) {
    createdData.adhoc = { goal: adhocGoal, check: checkCmd };
  } else {
    createdData.campaign = campaignId;
    if (campSpecId) createdData.spec = campSpecId;
    createdData.tasks = tasks;
    createdData.checks = parseChecks(specBody);
  }

  // worktree 隔離（09 4.3 / 03 7.3）。対象 nested git repo ごとに base（現行 HEAD）から
  // 決定論ブランチ ccisad/<run-id> を切り、worktree を out/<run-id>/wt/<repo> に張る。
  // worktree の base 追従先（baseBranch）と branch/path を created.data.worktree に焼く。
  // 以降の return/verify/accept はこの created.data.worktree から worktree を解決する。
  // out/ は project-context 側 gitignore 対象だが、src repo の .git はこの外部 path を
  // worktree として追跡できる（git worktree の追跡は path 位置に依らない。open question 1）。
  if (wantWorktree) {
    const wt = {};
    for (const [name, info] of Object.entries(resolved)) {
      if (!info.base || reposBase[name] === 'UNCOMMITTED') continue; // git repo かつ commit 済みのみ隔離。
      const branch = `ccisad/${runId}`;
      const baseBranch = currentBranch(info.path);
      const wtPath = path.join(outDir(root), runId, 'wt', name);
      worktreeAdd(info.path, wtPath, branch, info.base);
      wt[name] = { repo: name, path: wtPath, branch, base: info.base, baseBranch };
    }
    if (Object.keys(wt).length > 0) createdData.worktree = wt;
  }

  const refs = buildOpenRefs(campaignId, campSpecId, tasks);
  append(root, {
    type: 'created',
    subject,
    actor: { kind: 'cli' },
    data: createdData,
    refs,
  });

  // created と直後の transitioned が同一ミリ秒内に発番されると ULID の乱数部で
  // 順序が逆転し、state.derive の created 畳込みが status を初期値へ戻し得る。
  // 次ミリ秒まで待って created の ULID が transitioned より確実に前になるようにする。
  waitNextMillis();

  // 確定 run-id 版の handoff を合成して runs/ と out/ に保存する。
  const finalHandoff = synthesize({ ...synthArgs, runId, repos: reposBase });
  write(root, path.join('runs', runId, 'handoff.md'), finalHandoff.markdown);
  write(root, path.join('out', runId, 'handoff.md'), finalHandoff.markdown);

  // created -> handed-off（guard 焼込 + auto-commit）。
  attempt(root, {
    subject,
    from: 'created',
    to: 'handed-off',
    guards,
    actor: { kind: 'cli' },
    command: `run open ${adhocGoal ? '--adhoc' : campaignId}`,
    next: () => ['cc-iasd run block <run-id> --missing <ref>', 'cc-iasd gap add <ref>'],
    refs,
    commitMessage: `run open ${runId}`,
  });

  emit(jsonMode, `${runId}\n`, { ok: true, command: 'run open', run: runId });
  return runId;
}

function buildOpenRefs(campaignId, specId, tasks) {
  const refs = [];
  if (campaignId) refs.push({ rel: 'campaign', to: `campaign:${campaignId}` });
  if (specId) refs.push({ rel: 'upstream', to: `spec:${specId}` });
  for (const t of tasks || []) refs.push({ rel: 'selects', to: `task:${t}` });
  return refs.length ? refs : undefined;
}

// claim: 同一 task を対象とする未終端 run が既にあれば二重取り拒否。
function claimGuard(snap, campaignId, tasks) {
  const claimed = new Set();
  for (const r of Object.values(snap.runs)) {
    if (r.campaign !== campaignId) continue;
    if (!ACTIVE_STATES.has(r.status)) continue;
    for (const t of r.tasks || (r.task ? [r.task] : [])) claimed.add(t);
  }
  const dup = (tasks || []).filter((t) => claimed.has(t));
  return {
    name: 'claim',
    pass: dup.length === 0,
    detail: dup.length ? `task が既に claim 済み: ${dup.join(', ')}` : 'ok',
  };
}

// charter の Coverage 節を解析し、被覆 spec ごとの after 宣言（先行 spec）を得る。
// 記法（05 3 章「対象 spec に after: [spec-ref]」）:
//   covers spec:s001
//   covers spec:s002 after: [s001]        # s002 の task は s001 の全 run accepted 後
// 戻り値: [{ specId, after: [specId...] }]（Coverage 出現順）。
function coveredSpecs(root, campaignId) {
  const charter = readCharterBody(root, campaignId);
  const cov = charter ? extractSection(charter, 'Coverage') : null;
  if (!cov) return [];
  const out = [];
  const seen = new Set();
  const lineRe = /spec:([a-zA-Z0-9_-]+)/;
  for (const raw of cov.split('\n')) {
    const line = raw.trim();
    const sm = lineRe.exec(line);
    if (!sm) continue;
    const specId = sm[1];
    if (seen.has(specId)) continue;
    seen.add(specId);
    // 当該行に付随する after: [..] のみを対象 spec の先行依存とみなす（行スコープ）。
    let after = [];
    const am = /after\s*:\s*\[([^\]]*)\]/.exec(line);
    if (am && am[1].trim() !== '') {
      after = am[1]
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''))
        .map((s) => subjectId(s) || s)
        .filter(Boolean);
    }
    out.push({ specId, after });
  }
  return out;
}

// coverage 順序制約（05 3 章）: charter の Coverage が「対象 spec」に after: [spec-ref] を
// 宣言する場合、列挙 spec 配下の run が全て accepted 済みであること。
// targetSpecId が after を持たない（または未指定）なら常に pass。
function coverageOrderGuard(root, snap, campaignId, targetSpecId) {
  if (!targetSpecId) return { name: 'coverage-order', pass: true, detail: '対象 spec なし' };
  const entry = coveredSpecs(root, campaignId).find((e) => e.specId === targetSpecId);
  const afterSpecs = entry ? entry.after : [];
  if (afterSpecs.length === 0) {
    return { name: 'coverage-order', pass: true, detail: `spec:${targetSpecId} に after 宣言なし` };
  }
  const unmet = [];
  for (const id of afterSpecs) {
    const runsForRef = Object.values(snap.runs).filter((r) => r.campaign === id || r.spec === id);
    if (runsForRef.length === 0 || runsForRef.some((r) => r.status !== 'accepted')) {
      unmet.push(`spec:${id}`);
    }
  }
  return {
    name: 'coverage-order',
    pass: unmet.length === 0,
    detail: unmet.length
      ? `spec:${targetSpecId} の先行 accepted 未達: ${unmet.join(', ')}`
      : 'ok',
  };
}

// campaign が被覆する spec のうち、要求 task を Tasks 節に持つ spec を対象 spec とする。
// どの spec の Tasks にも属さない task のみ、または被覆宣言が無い場合は
// 先頭被覆 spec（なければ specs/ 昇順先頭）へフォールバックする（従来挙動維持）。
function resolveTargetSpec(root, campaignId, tasks) {
  const covered = coveredSpecs(root, campaignId);
  if (covered.length > 0) {
    if (tasks && tasks.length > 0) {
      for (const { specId } of covered) {
        const body = readSpecBody(root, specId);
        const owned = parseSpecTasks(body);
        if (tasks.every((t) => owned.includes(t))) return specId;
      }
      // 部分一致（要求 task の一部を含む spec）を次点で採る。
      for (const { specId } of covered) {
        const owned = parseSpecTasks(readSpecBody(root, specId));
        if (tasks.some((t) => owned.includes(t))) return specId;
      }
    }
    return covered[0].specId;
  }
  const dir = path.join(root, 'specs');
  if (fs.existsSync(dir)) {
    const subs = fs
      .readdirSync(dir)
      .filter((d) => fs.existsSync(path.join(dir, d, 'spec.md')))
      .sort();
    if (subs.length) return subs[0];
  }
  return null;
}

// spec の Tasks 節から task id（先頭トークン）を抽出する。
// 記法: `- T001 実装` / `- T001: 実装`。id は英数記号の先頭語。
function parseSpecTasks(specBody) {
  const sec = extractSection(specBody, 'Tasks');
  if (!sec) return [];
  const ids = [];
  for (const raw of sec.split('\n')) {
    const m = /^\s*[-*]\s*([A-Za-z0-9_-]+)\b/.exec(raw);
    if (m) ids.push(m[1]);
  }
  return ids;
}

// no-progress: 直近 N 個の終端 run が全て進捗ゼロ（accepted なし）なら拒否。
function noProgressGuard(snap, cfg) {
  const N = cfg.budgets.no_progress_runs;
  const terminal = Object.values(snap.runs).filter((r) =>
    ['accepted', 'blocked', 'escalated'].includes(r.status)
  );
  if (terminal.length < N) return { name: 'no-progress', pass: true, detail: 'run 数が上限未満' };
  const recent = terminal.slice(-N);
  const anyProgress = recent.some((r) => r.status === 'accepted');
  return {
    name: 'no-progress',
    pass: anyProgress,
    detail: anyProgress ? 'ok' : `直近 ${N} run が進捗ゼロ（accepted なし）`,
  };
}

// budget: cc-iasd.yaml の予算宣言が正であること（P1 の決定論下限）。
function budgetGuard(cfg) {
  const ok = Number.isFinite(cfg.budgets.max_minutes) && cfg.budgets.max_minutes > 0;
  return { name: 'budget', pass: ok, detail: ok ? 'ok' : 'budgets.max_minutes が不正' };
}

// write glob 交差: 同一 repo を共有する未終端 run と write glob が交差すれば拒否。
function writeGlobCrossGuard(snap, surfaces) {
  const myWrite = surfaces.write || [];
  if (myWrite.length === 0) return { name: 'write-glob-cross', pass: true, detail: 'write 面なし' };
  const conflicts = [];
  for (const [rid, r] of Object.entries(snap.runs)) {
    if (!ACTIVE_STATES.has(r.status)) continue;
    const otherWrite = (r.surface && r.surface.write) || [];
    for (const a of myWrite) {
      for (const b of otherWrite) {
        if (globsIntersect(a, b)) conflicts.push(`${rid}: ${b}`);
      }
    }
  }
  return {
    name: 'write-glob-cross',
    pass: conflicts.length === 0,
    detail: conflicts.length ? `write glob 交差: ${conflicts.join(', ')}` : 'ok',
  };
}

// glob 交差の保守的判定。非ワイルドカード接頭辞の包含、または相互 glob match で交差とみなす。
function globsIntersect(a, b) {
  if (a === b) return true;
  const prefix = (g) => {
    const star = g.indexOf('*');
    return star === -1 ? g : g.slice(0, star);
  };
  const pa = prefix(a);
  const pb = prefix(b);
  if (pa.startsWith(pb) || pb.startsWith(pa)) return true;
  if (matchGlob(a, pb) || matchGlob(b, pa)) return true;
  return false;
}

// --- run handoff ---

function cmdHandoff(root, runId, jsonMode) {
  requireRunId('run handoff', runId);
  const md = readRunFile(root, runId, 'handoff.md');
  if (md == null) {
    throw refuse(
      'run handoff',
      [{ input: 'handoff.md', detail: `runs/${runId}/handoff.md が存在しません` }],
      ['cc-iasd run open ...']
    );
  }
  // --json は handoff 本文を内包する（stdout 正本経路は --json なし時のみ）。
  emit(jsonMode, md.endsWith('\n') ? md : md + '\n', {
    ok: true,
    command: 'run handoff',
    run: runId,
    handoff: md,
  });
  return md;
}

// --- run return ---

function cmdReturn(root, runId, jsonMode) {
  requireRunId('run return', runId);
  const snap = loadSnapshot(root);
  const runInfo = snap.runs[runId];
  const subject = `run:${runId}`;
  const cfg = loadConfig(root);
  const repos = runInfo ? runInfo.repos || {} : {};
  // worktree run では diff snapshot を worktree 内で取る（created.data.worktree.path）。
  const resolved = applyWorktreePaths(resolveRepos(root, cfg, Object.keys(repos)), worktreeMapOf(root, runId));

  const snapshots = {};
  const guards = [
    () => ({
      name: 'run-state',
      pass: !!runInfo && runInfo.status === 'handed-off',
      detail: runInfo ? `run 状態=${runInfo.status}` : 'run が存在しません',
    }),
    () => ({
      name: 'stop-file',
      pass: !stopFileExists(root, runId),
      detail: stopFileExists(root, runId) ? 'STOP ファイルが存在します' : 'ok',
    }),
    () => ({
      name: 'notes',
      pass: fileNonEmpty(root, runId, 'notes.md'),
      detail: fileNonEmpty(root, runId, 'notes.md') ? 'ok' : 'notes.md が空または不在',
    }),
    () => {
      let ok = true;
      const details = [];
      for (const [name, info] of Object.entries(resolved)) {
        const base = repos[name];
        if (!info.base || base === 'UNCOMMITTED' || !base) continue;
        try {
          const changed = diffNames(info.path, base);
          snapshots[name] = { base, changedCount: changed.length, changed };
        } catch (e) {
          ok = false;
          details.push(`${name}: ${e.message}`);
        }
      }
      return {
        name: 'diff-snapshot',
        pass: ok,
        detail: ok ? 'ok' : `diff 取得失敗: ${details.join('; ')}`,
      };
    },
  ];

  attempt(root, {
    subject,
    from: 'handed-off',
    to: 'returned',
    guards,
    actor: { kind: 'cli' },
    command: `run return ${runId}`,
    next: () => [`cc-iasd run block ${runId} --missing <ref>`],
    commitMessage: `run return ${runId}`,
  });

  append(root, {
    type: 'note.appended',
    subject,
    actor: { kind: 'cli' },
    data: { kind: 'diff-snapshot', repos: snapshots },
  });
  autoCommitSafe(root, `run return snapshot ${runId}`);

  emit(jsonMode, `returned: ${runId}\n`, {
    ok: true,
    command: 'run return',
    run: runId,
    to: 'returned',
  });
  return runId;
}

// --- run verify ---

function cmdVerify(root, runId, jsonMode) {
  requireRunId('run verify', runId);
  const snap = loadSnapshot(root);
  const runInfo = snap.runs[runId];
  const subject = `run:${runId}`;

  if (!runInfo) {
    throw refuse('run verify', [{ input: 'run', detail: `run ${runId} が存在しません` }], [
      'cc-iasd run open ...',
    ]);
  }
  if (stopFileExists(root, runId)) {
    throw refuse('run verify', [{ input: 'stop-file', detail: 'STOP ファイルが存在します' }], []);
  }

  const cfg = loadConfig(root);
  const created = findCreated(root, runId);
  const cdata = (created && created.data) || {};
  const surfaces = cdata.surface || { write: [], forbid: [] };
  let checks = cdata.checks || [];
  if ((!checks || checks.length === 0) && cdata.adhoc && cdata.adhoc.check) {
    checks = [{ id: 'adhoc', run: cdata.adhoc.check, cwd: '.', expect: { exit: 0 } }];
  }

  const wtMap = worktreeMapOf(root, runId);
  const repoBaseMap = runInfo.repos || {};
  const resolvedAll = applyWorktreePaths(resolveRepos(root, cfg, Object.keys(repoBaseMap)), wtMap);
  const repos = {};
  for (const [name, base] of Object.entries(repoBaseMap)) {
    if (base === 'UNCOMMITTED') continue;
    const info = resolvedAll[name];
    if (info) repos[name] = { path: info.path, base };
  }

  // worktree run では checks を worktree 内で走らせる（09 4.3 の「隔離内で検証」）。
  // check.cwd が repo 相対（src/<repo> 直下想定）でなく root 相対のため、cwd 未指定・
  // "." の check を worktree ルートへ寄せる。明示 cwd（絶対/相対）は尊重する。
  let effChecks = checks;
  if (wtMap) {
    const wtEntries = Object.values(wtMap);
    if (wtEntries.length === 1) {
      const wtRoot = wtEntries[0].path;
      effChecks = checks.map((c) => {
        const cwd = c.cwd == null || c.cwd === '.' ? wtRoot : c.cwd;
        return { ...c, cwd };
      });
    }
  }

  // lib/verify.js を呼ぶ（repo 単位 lock で直列化・生出力捕捉・Surfaces 照合）。
  const verdict = runVerify(root, runId, { checks: effChecks, surfaces, repos });

  // worktree 隔離 run は accept 時に base ブランチへ merge する。conflict は「verify 失敗として
  // 機械検出」する（09 4.3）ため、accept 前の verify 段で merge dry-run を行い、conflict なら
  // verdict.pass を false へ倒す。これにより accept ガード（verification=pass）が自動封鎖される。
  const conflicts = [];
  if (wtMap) {
    for (const [name, wt] of Object.entries(wtMap)) {
      const info = resolvedAll[name];
      // dry-run は repo 本体（base ブランチ側）で実行する。worktree path ではなく元 repo path。
      const repoMain = resolveRepos(root, cfg, [name])[name];
      if (!repoMain || !isGitRepo(repoMain.path)) continue;
      const dry = worktreeMergeDryRun(repoMain.path, wt.baseBranch, wt.branch);
      if (!dry.ok) {
        conflicts.push({ repo: name, branch: wt.branch, base: wt.baseBranch, conflicts: dry.conflicts || [] });
      }
    }
  }
  if (conflicts.length > 0) {
    verdict.pass = false;
    verdict.surface = verdict.surface || { offSurface: [], forbidden: [] };
    verdict.mergeConflicts = conflicts;
  }

  // returned から verified へ遷移する。既に verified の run は再検証（fail 後の再実行）
  // として同一状態への遷移を許し、新しい verdict を記録する。
  const from = runInfo.status;
  attempt(root, {
    subject,
    from,
    to: 'verified',
    guards: [
      () => ({
        name: 'run-state',
        pass: from === 'returned' || from === 'verified',
        detail: `run 状態=${from}`,
      }),
    ],
    actor: { kind: 'cli' },
    command: `run verify ${runId}`,
    next: () => [`cc-iasd run return ${runId}`],
    commitMessage: `run verify ${runId}`,
  });

  const relVerdict = path.join('evidence', 'verifications', runId, 'verdict.json');
  append(root, {
    type: 'verify.recorded',
    subject,
    actor: { kind: 'cli' },
    data: {
      pass: verdict.pass,
      checks: verdict.checks.map((c) => ({ id: c.id, exit: c.exit, expect: c.expect, pass: c.pass })),
      surface: verdict.surface,
      ...(verdict.mergeConflicts ? { mergeConflicts: verdict.mergeConflicts } : {}),
    },
    payload: { path: relVerdict, sha256: verdict.payloadSha },
  });
  autoCommitSafe(root, `run verify record ${runId}`);

  const conflictNote = verdict.mergeConflicts
    ? `, merge-conflict=${verdict.mergeConflicts.map((c) => c.repo).join(',')}`
    : '';
  const human =
    `verify ${runId}: ${verdict.pass ? 'pass' : 'fail'} ` +
    `(checks=${verdict.checks.length}, off-surface=${verdict.surface.offSurface.length}, ` +
    `forbidden=${verdict.surface.forbidden.length}${conflictNote})\n`;
  emit(jsonMode, human, {
    ok: true,
    command: 'run verify',
    run: runId,
    pass: verdict.pass,
    checks: verdict.checks,
    surface: verdict.surface,
    ...(verdict.mergeConflicts ? { mergeConflicts: verdict.mergeConflicts } : {}),
  });
  return {
    pass: verdict.pass,
    checks: verdict.checks,
    surface: verdict.surface,
    ...(verdict.mergeConflicts ? { mergeConflicts: verdict.mergeConflicts } : {}),
  };
}

// --- run accept ---

function cmdAccept(root, runId, jsonMode) {
  requireRunId('run accept', runId);
  const cfg = loadConfig(root);
  const snap = loadSnapshot(root);
  const runInfo = snap.runs[runId];
  const subject = `run:${runId}`;

  if (!runInfo) {
    throw refuse('run accept', [{ input: 'run', detail: `run ${runId} が存在しません` }], []);
  }

  // reject 上限到達は accept 封鎖 -> escalate のみ（05 5.2）。
  const rejectCount = runInfo.reject_count || 0;
  if (rejectCount >= cfg.reject_limit) {
    throw refuse(
      'run accept',
      [
        {
          input: 'reject-limit',
          detail: `reject 回数 ${rejectCount} が上限 ${cfg.reject_limit} に到達。accept は封鎖されています`,
        },
      ],
      [`cc-iasd run escalate ${runId}`]
    );
  }

  const verification = snap.verifications[runId];
  const reviewSha = snap.reviews[subject] && snap.reviews[subject].run;
  const runGateRequired = cfg.gates.run === 'required';
  const blockers = blockingGapsFor(snap, subject);

  const guards = [
    () => ({
      name: 'run-state',
      pass: runInfo.status === 'verified',
      detail: `run 状態=${runInfo.status}`,
    }),
    () => ({
      name: 'verification',
      pass: !!verification && verification.pass === true,
      detail: verification ? `verification pass=${verification.pass}` : 'verification 記録なし',
    }),
    () => ({
      name: 'run-review',
      pass: runGateRequired ? isReviewFresh(root, runId, reviewSha) : true,
      detail: runGateRequired
        ? reviewSha
          ? 'review record 鮮度検査'
          : 'gate=run の review record なし'
        : 'run gate 不要',
    }),
    () => ({
      name: 'blocking-gap',
      pass: blockers.length === 0,
      detail: blockers.length ? `blocking gap open: ${blockers.join(', ')}` : 'ok',
    }),
    () => ({
      name: 'reject-limit',
      pass: rejectCount < cfg.reject_limit,
      detail: `reject 回数 ${rejectCount} / 上限 ${cfg.reject_limit}`,
    }),
  ];

  attempt(root, {
    subject,
    from: 'verified',
    to: 'accepted',
    guards,
    actor: { kind: 'cli' },
    command: `run accept ${runId}`,
    next: () => [
      `cc-iasd run verify ${runId}`,
      `cc-iasd review record run:${runId} --gate run`,
      `cc-iasd run escalate ${runId}`,
    ],
    commitMessage: `run accept ${runId}`,
  });

  // worktree 隔離 run: accept 遷移成功後に worktree ブランチを base ブランチへ merge する（09 4.3）。
  // conflict は verify 段の dry-run で先に封鎖されているのが正常経路。ここで万一 conflict した場合
  // （verify 後に base が進んだレース等）は canon「conflict は verify 失敗として機械検出」に立ち返り、
  // accept は成立済みだが merge は行わず re-verify を促す（worktree は残し手動掃除に委ねる）。
  const merged = mergeWorktreesOnAccept(root, cfg, runId);
  if (merged && merged.conflicts.length > 0) {
    throw refuse(
      'run accept',
      merged.conflicts.map((c) => ({
        input: 'worktree-merge',
        detail: `repo ${c.repo}: ${c.baseBranch} への merge が conflict（${(c.conflicts || []).join(', ') || '詳細不明'}）。accept は記録済みだが merge 未実施。`,
      })),
      [`cc-iasd run verify ${runId}`, `cc-iasd run escalate ${runId}`]
    );
  }

  emit(jsonMode, `accepted: ${runId}\n`, {
    ok: true,
    command: 'run accept',
    run: runId,
    to: 'accepted',
    ...(merged && merged.merged.length ? { merged: merged.merged } : {}),
  });
  return runId;
}

// worktree run の accept 後始末: repo ごとに worktree ブランチを base ブランチへ merge し、
// 成功なら commit.observed で merge 後 HEAD を記録 + worktree 掃除 + autoCommit する。
// conflict の repo は merge せず conflicts に積む（呼び出し側が refuse へ変換）。
// 非 worktree run では null を返す（何もしない）。
function mergeWorktreesOnAccept(root, cfg, runId) {
  const wtMap = worktreeMapOf(root, runId);
  if (!wtMap) return null;
  const subject = `run:${runId}`;
  const merged = [];
  const conflicts = [];
  const observed = {};
  for (const [name, wt] of Object.entries(wtMap)) {
    const repoMain = resolveRepos(root, cfg, [name])[name];
    if (!repoMain || !isGitRepo(repoMain.path)) continue;
    const res = worktreeMerge(repoMain.path, wt.baseBranch, wt.branch);
    if (res.ok) {
      merged.push({ repo: name, head: res.head });
      observed[name] = res.head;
      // merge 済みブランチの worktree を掃除する（自動 GC はしない。掃除のみ。09 4.3 スコープ内）。
      worktreeRemove(repoMain.path, wt.path);
    } else {
      conflicts.push({ repo: name, baseBranch: wt.baseBranch, branch: wt.branch, conflicts: res.conflicts });
    }
  }
  // merge 成功分の HEAD を commit.observed で run に焼く（state が repos base を上書き）。
  if (Object.keys(observed).length > 0) {
    append(root, {
      type: 'commit.observed',
      subject,
      actor: { kind: 'cli' },
      data: { repos: observed, reason: 'worktree-merge' },
    });
    autoCommitSafe(root, `run accept worktree-merge ${runId}`);
  }
  return { merged, conflicts };
}

// run gate の review record が対象成果物（notes.md）の現在 content-hash と一致するか。
function isReviewFresh(root, runId, reviewSha) {
  if (!reviewSha) return false;
  const notes = readRunFile(root, runId, 'notes.md');
  if (notes == null) return false;
  return contentHash(notes) === reviewSha;
}

// --- run block ---

function cmdBlock(root, runId, flags, jsonMode) {
  requireRunId('run block', runId);
  const snap = loadSnapshot(root);
  const runInfo = snap.runs[runId];
  const subject = `run:${runId}`;
  const missingRef = typeof flags.missing === 'string' ? flags.missing : null;

  if (!missingRef) {
    throw refuse(
      'run block',
      [{ input: '--missing', detail: '差し戻す上流 ref を --missing <ref> で指定してください' }],
      [`cc-iasd run block ${runId} --missing <ref>`]
    );
  }
  if (!runInfo) {
    throw refuse('run block', [{ input: 'run', detail: `run ${runId} が存在しません` }], []);
  }

  const from = runInfo.status;
  const report = renderBacktrackReport(runId, missingRef, from);
  write(root, path.join('runs', runId, 'report.md'), report);

  attempt(root, {
    subject,
    from,
    to: 'blocked',
    guards: [
      () => ({
        name: 'missing-ref',
        pass: !!missingRef,
        detail: missingRef ? `欠落上流 ref: ${missingRef}` : '--missing 未指定',
      }),
    ],
    actor: { kind: 'cli' },
    command: `run block ${runId}`,
    refs: [{ rel: 'upstream', to: missingRef }],
    commitMessage: `run block ${runId}`,
  });

  append(root, {
    type: 'created',
    subject: `report:${runId}`,
    actor: { kind: 'cli' },
    data: { kind: 'backtrack', run: runId, missing: missingRef },
    payload: { path: path.join('runs', runId, 'report.md'), sha256: contentHash(report) },
  });
  autoCommitSafe(root, `run block report ${runId}`);

  emit(jsonMode, `blocked: ${runId} (missing=${missingRef})\n`, {
    ok: true,
    command: 'run block',
    run: runId,
    to: 'blocked',
    missing: missingRef,
  });
  return runId;
}

function renderBacktrackReport(runId, missingRef, stage) {
  return [
    '---',
    `id: report:${runId}`,
    'refs:',
    `  - upstream:${missingRef}`,
    '---',
    '',
    `# report: backtrack ${runId}`,
    '',
    '## tool-owned',
    '',
    '```text',
    `source refs:  run:${runId}`,
    `欠落上流 ref:  ${missingRef}`,
    '```',
    '',
    '## backtrack request',
    '',
    '### blocked stage',
    '',
    stage,
    '',
    '### 欠落上流 ref',
    '',
    missingRef,
    '',
    '### 継続不能理由',
    '',
    '<!-- 推測なしに続けられない理由を記す。 -->',
    '',
    '### 推測継続時のリスク',
    '',
    '<!-- そのまま埋めて進んだ場合の危険を記す。 -->',
    '',
    '### 再開条件',
    '',
    `${missingRef} が上流で修正され、該当 gate が再 review されること。`,
    '',
  ].join('\n');
}

// --- run escalate ---

function cmdEscalate(root, runId, flags, jsonMode) {
  requireRunId('run escalate', runId);
  const snap = loadSnapshot(root);
  const runInfo = snap.runs[runId];
  const subject = `run:${runId}`;

  if (!runInfo) {
    throw refuse('run escalate', [{ input: 'run', detail: `run ${runId} が存在しません` }], []);
  }

  const from = runInfo.status;
  const reason = typeof flags.reason === 'string' ? flags.reason : '人間判断が必要な事項が発生した';
  const report = renderEscalationReport(runId, reason, from);
  write(root, path.join('runs', runId, 'report.md'), report);

  attempt(root, {
    subject,
    from,
    to: 'escalated',
    guards: [() => ({ name: 'escalation-packet', pass: true, detail: `stage=${from}` })],
    actor: { kind: 'cli' },
    command: `run escalate ${runId}`,
    commitMessage: `run escalate ${runId}`,
  });

  append(root, {
    type: 'created',
    subject: `report:${runId}`,
    actor: { kind: 'cli' },
    data: { kind: 'escalation', run: runId },
    payload: { path: path.join('runs', runId, 'report.md'), sha256: contentHash(report) },
  });
  autoCommitSafe(root, `run escalate report ${runId}`);

  emit(jsonMode, `escalated: ${runId}\n`, {
    ok: true,
    command: 'run escalate',
    run: runId,
    to: 'escalated',
    reason,
  });
  return runId;
}

function renderEscalationReport(runId, reason, stage) {
  return [
    '---',
    `id: report:${runId}`,
    'refs: []',
    '---',
    '',
    `# report: escalation ${runId}`,
    '',
    '## tool-owned',
    '',
    '```text',
    `source refs:  run:${runId}`,
    `stage:        ${stage}`,
    '```',
    '',
    '## escalation packet',
    '',
    '### 停止理由',
    '',
    reason,
    '',
    '### 選択肢',
    '',
    '<!-- 取り得る選択肢を複数列挙する。 -->',
    '',
    '### 各選択肢の影響',
    '',
    '<!-- 各選択肢を選んだ場合の影響を記す。 -->',
    '',
    '### 放置した場合の影響',
    '',
    '<!-- 決裁されず放置された場合の影響を記す。 -->',
    '',
    '### 推奨',
    '',
    '<!-- どの選択肢を推すか、その根拠を記す。 -->',
    '',
    '### 再開条件',
    '',
    '対応する decision が記録されること。',
    '',
    '### 関連証跡',
    '',
    `evidence/verifications/${runId}/`,
    '',
  ].join('\n');
}

// --- 低レベルユーティリティ ---

function requireRunId(command, runId) {
  if (!runId) {
    throw refuse(command, [{ input: 'run-id', detail: 'run-id を指定してください' }], [
      `cc-iasd ${command} <run-id>`,
    ]);
  }
}

// 壁時計が次のミリ秒へ進むまで待つ。ULID の時刻部（ms 分解能）を確実に前進させ、
// 同一 subject の created -> transitioned の畳込み順序を決定論化する。
function waitNextMillis() {
  const start = Date.now();
  while (Date.now() === start) {
    // 短いビジーウェイト（通常 1ms 未満）。
  }
}

export default run;
