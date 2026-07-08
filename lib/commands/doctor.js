import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { refuse } from '../refuse.js';
import { load as loadConfig } from '../config.js';
import { readAll, subjectKind, subjectId, validateEventSchema } from '../journal.js';
import { derive, blockingGapsFor } from '../state.js';
import { MANAGED_DIRS, MANAGED_FILES, srcDir, configPath } from '../paths.js';
import { refKeySet } from '../refs.js';
import { contentHash, sha256 } from '../hash.js';

// doctor は決定論的検査のみを行う（ファイル存在 / パース / hash / journal カウント）。
// LLM 的推定・自己申告は評価しない。各検査は finding を返し、ひとつでも
// severity=error があれば doctor は非 green（exit 1）になる。

// src/ 配下に管理物が混入していないかの deny-glob。管理領域のトップレベル名が
// src/ 直下に現れたら違反とみなす（03 5 章の src 隔離不変条件）。
const SRC_DENY_NAMES = new Set([...MANAGED_DIRS, ...MANAGED_FILES]);

function readTextSafe(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

// frontmatter（--- ... ---）を抽出し js-yaml でパースする。無ければ null。
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(String(text));
  if (!m || m.index !== 0) return null;
  try {
    const parsed = loadYaml(m[1]);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return null;
  }
}

// refs 正規化は lib/refs.js（refKeySet）に一本化した。authoring の遷移時写像と
// 同一セマンティクス（単一キー map「- upstream: vision:v001」対応込み）で扱う。
// 旧 doctor 実装は単一キー map を ":" に潰していたため frontmatter-refs を誤検出していた。

function dirEntries(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir);
}

function findDir(parent, pred) {
  for (const f of dirEntries(parent)) {
    const abs = path.join(parent, f);
    if (pred(f) && fs.statSync(abs).isDirectory()) return abs;
  }
  return null;
}

// subject / ref が指す artifact が実在するかを解決する。
// vision / spec / campaign は authored file を持つため管理領域のファイル実在で判定する。
// decision は authored file を持たず journal subject としてのみ存在する設計のため、
// snapshot に当該ノードが居れば解決成功とする（他の journal-native subject も同様）。
// gap / run / project / task / cap-* 等は journal 側が正本のためファイル実在を要求しない。
function artifactExists(root, ref, snapshot) {
  const kind = subjectKind(ref);
  const id = subjectId(ref);
  if (!id) return true;
  switch (kind) {
    case 'vision':
      return dirEntries(path.join(root, 'vision')).some((f) => f.startsWith(`${id}-`) && f.endsWith('.md'));
    case 'spec': {
      const dir = findDir(path.join(root, 'specs'), (d) => d.startsWith(`${id}-`) || d === id);
      return !!dir && fs.existsSync(path.join(dir, 'spec.md'));
    }
    case 'campaign': {
      const dir = findDir(path.join(root, 'campaigns'), (d) => d.startsWith(`${id}-`) || d === id);
      return !!dir && fs.existsSync(path.join(dir, 'charter.md'));
    }
    case 'decision': {
      // decision は authored file を持たない（decide が journal に焼く journal-native subject）。
      // snapshot に decision ノードがあれば解決成功。adopt 経路で decisions/ に本文が
      // 取り込まれている場合はファイル実在でも解決する（後方互換）。
      if (snapshot && snapshot.nodes && snapshot.nodes[ref]) return true;
      return dirEntries(path.join(root, 'decisions')).some((f) => f.startsWith(`${id}-`) && f.endsWith('.md'));
    }
    default:
      return true;
  }
}

// authored payload のファイルパスを ref から引く（frontmatter refs 検査用）。
function artifactPayloadPath(root, ref) {
  const kind = subjectKind(ref);
  const id = subjectId(ref);
  if (!id) return null;
  switch (kind) {
    case 'vision': {
      const f = dirEntries(path.join(root, 'vision')).find((x) => x.startsWith(`${id}-`) && x.endsWith('.md'));
      return f ? path.join(root, 'vision', f) : null;
    }
    case 'spec': {
      const d = findDir(path.join(root, 'specs'), (x) => x.startsWith(`${id}-`) || x === id);
      return d ? path.join(d, 'spec.md') : null;
    }
    case 'campaign': {
      const d = findDir(path.join(root, 'campaigns'), (x) => x.startsWith(`${id}-`) || x === id);
      return d ? path.join(d, 'charter.md') : null;
    }
    case 'decision': {
      const f = dirEntries(path.join(root, 'decisions')).find((x) => x.startsWith(`${id}-`) && x.endsWith('.md'));
      return f ? path.join(root, 'decisions', f) : null;
    }
    default:
      return null;
  }
}

// spec 本文から [UNRESOLVED: gNNN] マーカーを抽出する。
function extractMarkers(text) {
  const out = [];
  const re = /\[UNRESOLVED:\s*(g\d+)\s*\]/g;
  let m;
  while ((m = re.exec(String(text))) !== null) out.push(m[1]);
  return out;
}

// ---- 各検査 ----

function checkStructure(root, findings) {
  for (const dir of MANAGED_DIRS) {
    if (!fs.existsSync(path.join(root, dir))) {
      findings.push({
        check: 'structure',
        severity: dir === 'journal' ? 'error' : 'warn',
        detail: `管理ディレクトリが欠落: ${dir}/`,
      });
    }
  }
  if (!fs.existsSync(configPath(root))) {
    findings.push({ check: 'structure', severity: 'error', detail: 'cc-iasd.yaml が欠落' });
    return null;
  }
  try {
    return loadConfig(root);
  } catch (e) {
    findings.push({ check: 'structure', severity: 'error', detail: `cc-iasd.yaml 検証失敗: ${e.message}` });
    return null;
  }
}

function checkSrcContamination(root, cfg, findings) {
  const src = srcDir(root);
  if (fs.existsSync(src)) {
    for (const name of fs.readdirSync(src)) {
      if (SRC_DENY_NAMES.has(name)) {
        findings.push({
          check: 'src-contamination',
          severity: 'error',
          detail: `src/ 配下に管理物が混入: src/${name}（管理領域は project-context 直下のみ）`,
        });
      }
    }
  }
  if (cfg && Array.isArray(cfg.repos)) {
    for (const r of cfg.repos) {
      const abs = path.resolve(root, r.path);
      if (!fs.existsSync(abs)) {
        findings.push({
          check: 'repo-registration',
          severity: 'error',
          detail: `登録 repo の実体が無い: ${r.name} (${r.path})`,
        });
      } else if (!fs.existsSync(path.join(abs, '.git'))) {
        findings.push({
          check: 'repo-registration',
          severity: 'warn',
          detail: `登録 repo が nested git ではない: ${r.name} (${r.path})`,
        });
      }
    }
  }
}

function checkJournalRefs(root, events, findings, snapshot) {
  for (const ev of events) {
    if (!Array.isArray(ev.refs)) continue;
    for (const ref of ev.refs) {
      const to = ref && ref.to;
      if (!to) continue;
      if (!artifactExists(root, to, snapshot)) {
        findings.push({
          check: 'journal-refs',
          severity: 'error',
          detail: `event ${ev.id} の ref が解決不能: ${to}（subject=${ev.subject}）`,
        });
      }
    }
  }
}

function checkGuardRecalc(events, findings) {
  // guard_results の再計算一致（06 3.3 / 06 9 章 / 09 4.4「再計算検証の範囲の拡充」）。
  //  (1) 不変量照合: transitioned event は guard_results（配列）を必ず持ち、記録された全
  //      ガードは pass=true でなければならない（fail が 1 つでも記録されていれば遷移は
  //      成立しないはずで、記録との矛盾 = 改竄/ドリフト）。
  //  (2) 真の再計算: 決定論的に再実行可能なガード（blocking-gap / no-blocking-gap /
  //      verification / run-review）を、当該 event 直前の時点 snapshot から再計算し、
  //      記録された guard_results の pass と照合する。時点 snapshot は deriveUpTo（本
  //      ファイル内ローカル実装。events を id でフィルタして derive を呼ぶだけ）で再構成する。
  //      再計算値と記録値の不一致 = error（本来止まるべき遷移が journal に在る）。
  //
  // 実行系ガード（spec-sections / cross-check:* / checks-allowlist 等、外部プロセスや
  // 本文パースに依存するもの）は再実行しない（既存原則: verify・Cross-Checks 由来を
  // doctor が再実行しない）。ここで再計算するのは snapshot だけで決まるガードに限る。
  for (const ev of events) {
    if (ev.type !== 'transitioned') continue;
    const gr = ev.data && ev.data.guard_results;
    if (!Array.isArray(gr)) {
      findings.push({
        check: 'guard-recalc',
        severity: 'error',
        detail: `transitioned event ${ev.id} に guard_results がない`,
      });
      continue;
    }
    for (const g of gr) {
      if (!g || g.pass !== true) {
        findings.push({
          check: 'guard-recalc',
          severity: 'error',
          detail: `event ${ev.id} の guard_results に fail が記録されている: ${g && g.name}`,
        });
      }
    }

    // (2) 時点 snapshot からの再計算照合。
    let snapBefore;
    try {
      snapBefore = deriveUpTo(events, ev.id);
    } catch {
      continue; // 時点導出に失敗したら (1) の不変量照合のみで済ませる。
    }
    const subject = ev.subject;
    for (const g of gr) {
      if (!g || typeof g.name !== 'string') continue;
      const recalc = recalcGuard(snapBefore, subject, g.name);
      if (recalc == null) continue; // 再計算対象外のガード。
      if (recalc !== g.pass) {
        findings.push({
          check: 'guard-recalc',
          severity: 'error',
          detail: `event ${ev.id} のガード "${g.name}" 再計算不一致（記録=${g.pass} / 再計算=${recalc}, subject=${subject}）`,
        });
      }
    }
  }
}

// 時点 snapshot の再構成（09 4.4「再計算検証」）。events を「対象 event の id 未満のみ」で
// derive する。ULID は時系列順のため id < beforeId が「当該 event 直前」を意味する。
// state.js は worktree 担当所有のため、audit は deriveUpTo を doctor 内ローカルに置く
// （events フィルタ + derive 呼び出しのみ。導出ロジックは複製しない）。
function deriveUpTo(events, beforeId) {
  return derive(events.filter((e) => e.id < beforeId));
}

// snapshot だけで決まるガードを再計算し pass(boolean) を返す。再計算対象外なら null。
// blocking-gap / no-blocking-gap: 対象 subject を target とする open blocking gap が
//   無ければ pass。spec ready / campaign launch / run accept のいずれもこの名で焼く。
// verification: run subject の verifications[runId].pass が true なら pass。
// review 系ガード（spec-review / run-review / launch-review / completion-review）は対象本文の
//   content-hash 鮮度に依存するため、ここでは再計算せず（null）evidence-hash 検査側へ委ねる。
function recalcGuard(snapBefore, subject, name) {
  switch (name) {
    case 'blocking-gap':
    case 'no-blocking-gap':
      return blockingGapsFor(snapBefore, subject).length === 0;
    case 'verification': {
      if (subjectKind(subject) !== 'run') return null;
      const rid = subjectId(subject);
      const v = snapBefore.verifications[rid];
      return !!(v && v.pass === true);
    }
    default:
      return null;
  }
}

// review.recorded / verify.recorded から対象 authored payload path を引く（evidence-hash 検査）。
// review: subject の kind と gate で対象本文を決める（spec->spec.md / campaign->charter.md /
//   run->runs/<runId>/notes.md）。payload.sha256 は対象本文の contentHash。
// verify: 対象は evidence/verifications/<runId>/verdict.json（実ファイル）。
function reviewTargetPath(root, subject) {
  const kind = subjectKind(subject);
  const id = subjectId(subject);
  if (!id) return null;
  switch (kind) {
    case 'spec': {
      const d = findDir(path.join(root, 'specs'), (x) => x.startsWith(`${id}-`) || x === id);
      return d ? path.join(d, 'spec.md') : null;
    }
    case 'campaign': {
      const d = findDir(path.join(root, 'campaigns'), (x) => x.startsWith(`${id}-`) || x === id);
      return d ? path.join(d, 'charter.md') : null;
    }
    case 'run': {
      // run-id は slug 込みで runs/<run-id>/ に直接対応する（run 側はサブスラッグ分割なし）。
      // 念のため id 一致 / id- プレフィックスの双方を許容する。
      const rd = findDir(path.join(root, 'runs'), (x) => x === id || x.startsWith(`${id}-`));
      const dir = rd || path.join(root, 'runs', id);
      return path.join(dir, 'notes.md');
    }
    default:
      return null;
  }
}

// 2-1. evidence-hash 検査（06 9 章「evidence hash」）。
//  review.recorded: payload.sha256 が対象 authored 本文の現在 contentHash と一致するか。
//    不一致 = warn（canon「stale なら次遷移で再 review」— 鮮度切れであり違反ではない）。
//    payload.path のファイル欠落 = error（証跡の指す対象が消失）。
//  verify.recorded: payload.sha256 が verdict.json 実ファイルの sha256(JSON.stringify(verdict))
//    と一致するか。verdict.json は 2 space インデント保存だが payload.sha256 は無インデントの
//    JSON.stringify(verdict) の sha256（verify.js）。よって読取 -> parse -> 無インデント再直列化
//    -> sha256 で再計算し照合する。実ファイル欠落 = error。
function checkEvidenceHash(root, events, findings) {
  for (const ev of events) {
    if (ev.type === 'review.recorded') {
      const payload = ev.payload || {};
      const recPath = payload.path ? path.join(root, payload.path) : null;
      // payload.path（evidence/reviews/<...>.json）自体の存在。
      if (!recPath || !fs.existsSync(recPath)) {
        findings.push({
          check: 'evidence-hash',
          severity: 'error',
          detail: `review record の payload が消失: ${payload.path}（event ${ev.id}, subject=${ev.subject}）`,
        });
        continue;
      }
      // 対象 authored 本文の現在 contentHash と payload.sha256 の照合。
      const targetPath = reviewTargetPath(root, ev.subject);
      if (!targetPath || !fs.existsSync(targetPath)) {
        findings.push({
          check: 'evidence-hash',
          severity: 'error',
          detail: `review が指す対象成果物が消失: ${ev.subject}（event ${ev.id}）`,
        });
        continue;
      }
      const text = readTextSafe(targetPath);
      const cur = text == null ? null : contentHash(text);
      if (cur !== payload.sha256) {
        findings.push({
          check: 'evidence-hash',
          severity: 'warn',
          detail: `review record が stale: ${ev.subject}（記録 sha=${String(payload.sha256).slice(0, 12)}... / 現在=${String(cur).slice(0, 12)}...。編集後に再 review が必要）`,
        });
      }
    } else if (ev.type === 'verify.recorded') {
      const payload = ev.payload || {};
      const verdictPath = payload.path ? path.join(root, payload.path) : null;
      if (!verdictPath || !fs.existsSync(verdictPath)) {
        findings.push({
          check: 'evidence-hash',
          severity: 'error',
          detail: `verify verdict が消失: ${payload.path}（event ${ev.id}, subject=${ev.subject}）`,
        });
        continue;
      }
      const raw = readTextSafe(verdictPath);
      let recomputed = null;
      try {
        recomputed = sha256(JSON.stringify(JSON.parse(raw)));
      } catch {
        recomputed = null;
      }
      if (recomputed !== payload.sha256) {
        findings.push({
          check: 'evidence-hash',
          severity: 'error',
          detail: `verdict.json の sha256 が event payload と不一致（event ${ev.id}, subject=${ev.subject}。改変後証跡の可能性）`,
        });
      }
    }
  }
}

// 2-2. decision-unit 充足検査（06 9 章「決定単位の充足」）。
// 各 transitioned event について、その決定が依拠すべき evidence 参照が、当該 event の
// 直前 snapshot に揃っているかを再計算で照合する。欠落した状態で成立している遷移 =
// error（guard が本来止めるはずの遷移が journal に在る = 改竄/ドリフト）。
//   run -> accepted: 同一 run の verification(pass) が先行。run gate=required なら
//                    reviews[run:<id>].run も存在（gate 設定に依存するため両立可を許容）。
//   spec -> ready:      reviews[spec:<id>].spec が存在。
//   campaign -> active: reviews[campaign:<id>].launch が存在。
//   campaign -> closed: reviews[campaign:<id>].completion が存在。
//   decision -> decided: 対応する decision.recorded(actor=human) が存在。
function checkDecisionUnit(root, events, findings) {
  const cfg = (() => {
    try {
      return loadConfig(root);
    } catch {
      return null;
    }
  })();
  const runGateRequired = !!(cfg && cfg.gates && cfg.gates.run === 'required');

  for (const ev of events) {
    if (ev.type === 'transitioned') {
      const to = ev.data && ev.data.to;
      if (!to) continue;
      const kind = subjectKind(ev.subject);
      let snapBefore;
      try {
        snapBefore = deriveUpTo(events, ev.id);
      } catch {
        continue;
      }
      const missing = [];
      if (kind === 'run' && to === 'accepted') {
        const rid = subjectId(ev.subject);
        const v = snapBefore.verifications[rid];
        if (!(v && v.pass === true)) missing.push('verification(pass)');
        if (runGateRequired) {
          const rv = snapBefore.reviews[ev.subject];
          if (!(rv && rv.run)) missing.push('review record(gate=run)');
        }
      } else if (kind === 'spec' && to === 'ready') {
        const rv = snapBefore.reviews[ev.subject];
        if (!(rv && rv.spec)) missing.push('review record(gate=spec)');
      } else if (kind === 'campaign' && to === 'active') {
        const rv = snapBefore.reviews[ev.subject];
        if (!(rv && rv.launch)) missing.push('review record(gate=launch)');
      } else if (kind === 'campaign' && to === 'closed') {
        const rv = snapBefore.reviews[ev.subject];
        if (!(rv && rv.completion)) missing.push('review record(gate=completion)');
      }
      if (missing.length > 0) {
        findings.push({
          check: 'decision-unit',
          severity: 'error',
          detail: `証拠なし遷移: ${ev.subject} -> ${to}（欠落 evidence: ${missing.join(', ')}, event ${ev.id}）`,
        });
      }
    } else if (ev.type === 'decision.recorded') {
      // decision.recorded は actor=human でなければならない（決定単位の主体要件）。
      if (!ev.actor || ev.actor.kind !== 'human') {
        findings.push({
          check: 'decision-unit',
          severity: 'error',
          detail: `decision.recorded の actor が human ではない: ${ev.subject}（actor=${ev.actor && ev.actor.kind}, event ${ev.id}）`,
        });
      }
    }
  }
}

// 2-4. ULID 時系列整合検査（06 3.1 ULID / 03 4.1「順序は ULID で決まる」）。
//  (a) journal ファイル名 ULID（<id>.json）と event.id の一致。
//  (b) ts(ISO8601)の単調性が ULID 昇順と矛盾しないか（ULID 昇順で ts が逆行していないか）。
// 逆転検出 = warn（auto-commit と git 履歴が一次証跡。canon 09 5.2 で粒度は観察事項）。
function checkUlidOrder(root, events, findings) {
  // (a) ファイル名と event.id の一致。
  const dir = path.join(root, 'journal');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const nameId = f.slice(0, -'.json'.length);
      const text = readTextSafe(path.join(dir, f));
      if (text == null) continue;
      let ev;
      try {
        ev = JSON.parse(text);
      } catch {
        continue; // readAll 側が error 済み。
      }
      if (ev && ev.id !== nameId) {
        findings.push({
          check: 'ulid-order',
          severity: 'warn',
          detail: `journal ファイル名と event.id が不一致: ${f}（event.id=${ev.id}）`,
        });
      }
    }
  }

  // (b) ULID 昇順（= readAll の並び）で ts が逆行していないか。
  let prev = null;
  for (const ev of events) {
    if (!ev || typeof ev.ts !== 'string') continue;
    const t = Date.parse(ev.ts);
    if (Number.isNaN(t)) continue;
    if (prev && t < prev.t) {
      findings.push({
        check: 'ulid-order',
        severity: 'warn',
        detail: `ULID 昇順に対し ts が逆行: ${ev.id}(ts=${ev.ts}) が直前 ${prev.id}(ts=${prev.ts}) より過去`,
      });
    }
    prev = { id: ev.id, ts: ev.ts, t };
  }
}

// 2-5. evidence-file と journal の突合（03 4.2「evidence の sha256 一致」の対象実在側）。
//  (a) journal の verify.recorded / review.recorded が指す payload.path が実在するか
//      （evidence-hash 検査が payload 欠落を error にするため、ここでは孤立側に軸足を置く）。
//  (b) 孤立 evidence: evidence/verifications/<runId>/verdict.json / evidence/reviews/*.json の
//      うち、対応する journal event（同 payload.path を指す verify/review）が無いもの = warn。
function checkEvidenceFiles(root, events, findings) {
  // journal が参照する payload.path 集合（root 相対 / posix 正規化）。
  const referenced = new Set();
  for (const ev of events) {
    if (ev.type !== 'verify.recorded' && ev.type !== 'review.recorded') continue;
    const p = ev.payload && ev.payload.path;
    if (p) referenced.add(String(p).split(path.sep).join('/'));
  }

  // (b-1) verifications 配下の孤立 verdict.json。
  const vDir = path.join(root, 'evidence', 'verifications');
  if (fs.existsSync(vDir)) {
    for (const rid of fs.readdirSync(vDir)) {
      const verdict = path.join(vDir, rid, 'verdict.json');
      if (!fs.existsSync(verdict)) continue;
      const rel = path.join('evidence', 'verifications', rid, 'verdict.json').split(path.sep).join('/');
      if (!referenced.has(rel)) {
        findings.push({
          check: 'evidence-files',
          severity: 'warn',
          detail: `孤立 evidence: ${rel} に対応する verify.recorded が journal にありません`,
        });
      }
    }
  }

  // (b-2) reviews 配下の孤立 record。
  const rDir = path.join(root, 'evidence', 'reviews');
  if (fs.existsSync(rDir)) {
    for (const f of fs.readdirSync(rDir)) {
      if (!f.endsWith('.json')) continue;
      const rel = path.join('evidence', 'reviews', f).split(path.sep).join('/');
      if (!referenced.has(rel)) {
        findings.push({
          check: 'evidence-files',
          severity: 'warn',
          detail: `孤立 evidence: ${rel} に対応する review.recorded が journal にありません`,
        });
      }
    }
  }
}

// event schema（06 3.1）の構造健全性検査。closed set / 必須欄 / payload 形の破れは
// 3 不変条件（決定論的検査可能性）の前提を崩すため error（validateEventSchema は journal 所有）。
function checkEventSchema(events, findings) {
  for (const ev of events) {
    const problems = validateEventSchema(ev);
    for (const p of problems) {
      findings.push({
        check: 'event-schema',
        severity: 'error',
        detail: `event ${ev && ev.id ? ev.id : '(id 不明)'}: ${p}`,
      });
    }
  }
}

function checkFrontmatterRefs(root, events, findings) {
  // journal 導出 refs（正本）と frontmatter refs（宣言入力）の一致（06 2.3）。
  const snap = derive(events);
  for (const [subject, node] of Object.entries(snap.nodes)) {
    const payloadPath = artifactPayloadPath(root, subject);
    if (!payloadPath || !fs.existsSync(payloadPath)) continue;
    const text = readTextSafe(payloadPath);
    if (text == null) continue;
    const fm = parseFrontmatter(text);
    if (fm == null) {
      findings.push({
        check: 'frontmatter-refs',
        severity: 'warn',
        detail: `${subject} の frontmatter がパースできない: ${path.relative(root, payloadPath)}`,
      });
      continue;
    }
    const fmRefs = refKeySet(fm.refs);
    const jRefs = refKeySet(node.refs);
    // 不変条件（06 2.3）: frontmatter に宣言された ref は遷移時に journal へ取り込まれる。
    // したがって「frontmatter で宣言された ref が journal に取込まれていない」（fm ⊆ journal の
    // 破れ）を error とする。逆方向（journal ⊆ frontmatter）は正本の要求ではない。tool 生成 refs
    // （decide の approved-by / run の selects 等）は frontmatter に書かれないのが正しい挙動のため、
    // journal 側にだけ在る ref は不整合ではない。
    for (const r of fmRefs) {
      if (!jRefs.has(r)) {
        findings.push({
          check: 'frontmatter-refs',
          severity: 'error',
          detail: `${subject}: frontmatter ref "${r}" が journal に取込まれていない（${path.relative(root, payloadPath)}）`,
        });
      }
    }
  }
}

function checkBareMarkers(root, events, findings) {
  // spec 本文の [UNRESOLVED: gNNN] が台帳（journal の gap）に実在するか（06 7.2 / 9）。
  const snap = derive(events);
  const specsDir = path.join(root, 'specs');
  if (!fs.existsSync(specsDir)) return;
  for (const d of fs.readdirSync(specsDir)) {
    const specFile = path.join(specsDir, d, 'spec.md');
    if (!fs.existsSync(specFile)) continue;
    const text = readTextSafe(specFile);
    if (text == null) continue;
    for (const gid of extractMarkers(text)) {
      if (!snap.gaps[gid]) {
        findings.push({
          check: 'bare-marker',
          severity: 'error',
          detail: `裸マーカー: specs/${d}/spec.md の [UNRESOLVED: ${gid}] が台帳に存在しない`,
        });
      }
    }
  }
}

// 導入時 baseline 検査（14 5.4）。両検査とも severity=warn（3 不変条件の破れではない）。
//  (a) 登録 repo（cc-iasd.yaml の repos）のうち baseline event に記録が無いもの。
//      baseline event 自体が無い旧 project-context も同様に warn。
//  (b) baseline event で dirty=true と記録された repo。
// 現在の working tree の dirty 検査はしない（実行中 run が正当に dirty にするため誤検出になる）。
function checkAdoptionBaseline(cfg, events, findings) {
  const registered = cfg && Array.isArray(cfg.repos) ? cfg.repos : [];

  // baseline event は init が 1 件刻む。複数あれば最新（時系列末尾）を採用する。
  const baselineEvents = events.filter((ev) => ev.type === 'baseline.recorded');
  const latest = baselineEvents.length > 0 ? baselineEvents[baselineEvents.length - 1] : null;
  const baselineRepos =
    latest && latest.data && Array.isArray(latest.data.repos) ? latest.data.repos : [];
  const byName = new Map(baselineRepos.map((r) => [r.name, r]));

  // (a) 登録 repo のうち baseline に記録が無いもの（baseline event 自体が無い場合も含む）。
  for (const r of registered) {
    if (!byName.has(r.name)) {
      findings.push({
        check: 'adoption-baseline',
        severity: 'warn',
        detail: `登録 repo に baseline がありません: ${r.name}（init 後に登録された repo か、baseline event を持たない旧 project-context です）`,
      });
    }
  }

  // (b) baseline で dirty=true と記録された repo。
  for (const b of baselineRepos) {
    if (b && b.dirty === true) {
      findings.push({
        check: 'adoption-baseline',
        severity: 'warn',
        detail: `導入時点で working tree が dirty でした: ${b.name}`,
      });
    }
  }
}

// adhoc run 比率（08 8.1）。昇格促し表示用。error ではない。
function adhocRatio(events) {
  const snap = derive(events);
  let total = 0;
  let adhoc = 0;
  for (const runNode of Object.values(snap.runs)) {
    total += 1;
    if (!runNode.campaign && !runNode.spec) adhoc += 1;
  }
  return { total, adhoc };
}

export function run({ root, jsonMode }) {
  if (!root || !fs.existsSync(path.join(root, 'journal'))) {
    throw refuse(
      'doctor',
      [{ input: 'project-context root', detail: 'journal/ を持つ project-context が見つかりません' }],
      ['cc-iasd init'],
    );
  }

  const findings = [];
  const cfg = checkStructure(root, findings);

  let events = [];
  try {
    events = readAll(root);
  } catch (e) {
    findings.push({ check: 'journal', severity: 'error', detail: `journal 読込失敗: ${e.message}` });
  }

  // snapshot は複数検査で使うため一度だけ導出する。
  let snapshot = { nodes: {}, gaps: {}, runs: {}, reviews: {}, verifications: {} };
  try {
    snapshot = derive(events);
  } catch {
    /* journal 読込失敗時は上で error 済み。空 snapshot で続行する。 */
  }

  checkSrcContamination(root, cfg, findings);
  checkEventSchema(events, findings);
  checkJournalRefs(root, events, findings, snapshot);
  checkGuardRecalc(events, findings);
  checkFrontmatterRefs(root, events, findings);
  checkBareMarkers(root, events, findings);
  checkAdoptionBaseline(cfg, events, findings);
  // P4 監査強化（09 4.4 / 06 9 章）: evidence-hash / decision-unit / ULID 整合 / evidence-file 突合。
  checkEvidenceHash(root, events, findings);
  checkDecisionUnit(root, events, findings);
  checkUlidOrder(root, events, findings);
  checkEvidenceFiles(root, events, findings);

  const ratio = adhocRatio(events);
  const errors = findings.filter((f) => f.severity === 'error');
  const warns = findings.filter((f) => f.severity === 'warn');
  const green = errors.length === 0;

  if (jsonMode) {
    process.stdout.write(
      JSON.stringify({
        ok: green,
        command: 'doctor',
        green,
        errors,
        warnings: warns,
        adhoc: ratio,
      }) + '\n',
    );
  } else {
    const lines = [];
    lines.push(green ? 'doctor: green（error なし）' : `doctor: red（error ${errors.length} 件）`);
    for (const f of errors) lines.push(`  [error] ${f.check}: ${f.detail}`);
    for (const f of warns) lines.push(`  [warn]  ${f.check}: ${f.detail}`);
    if (ratio.total > 0) {
      const pct = Math.round((ratio.adhoc / ratio.total) * 100);
      lines.push(`adhoc run 比率: ${ratio.adhoc}/${ratio.total} (${pct}%)`);
      if (ratio.adhoc > 0) {
        lines.push('  adhoc が続く場合は spec / campaign への昇格を検討してください。');
      }
    }
    process.stdout.write(lines.join('\n') + '\n');
  }

  if (!green) {
    process.exitCode = 1;
  }
}

export default run;
