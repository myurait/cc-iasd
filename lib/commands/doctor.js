import fs from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { refuse } from '../refuse.js';
import { load as loadConfig } from '../config.js';
import { readAll, subjectKind, subjectId } from '../journal.js';
import { derive } from '../state.js';
import { MANAGED_DIRS, MANAGED_FILES, srcDir, configPath } from '../paths.js';
import { refKeySet } from '../refs.js';

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
  // guard_results の再計算一致（06 9 章）。doctor は個別 guard fn を持たないため、
  // 決定論的に検査可能な不変量を照合する:
  //  - transitioned event は guard_results（配列）を必ず持つ
  //  - 記録された全ガードは pass=true でなければならない
  //    （fail が 1 つでもあれば遷移は成立しないはずで、記録との矛盾 = 改竄/ドリフト）
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
  checkJournalRefs(root, events, findings, snapshot);
  checkGuardRecalc(events, findings);
  checkFrontmatterRefs(root, events, findings);
  checkBareMarkers(root, events, findings);

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
