import fs from 'node:fs';
import path from 'node:path';

import { subjectKind, subjectId } from './journal.js';
import { extractSection } from './handoff.js';

// covers 射影（設計 06 8 章）。
//
// 責務: vision の Capabilities（構造化チェックリスト）を capability の宣言正本とし、
// spec / campaign が張る covers ref（rel=covers, to=<cap-id>）から
// 「capability × カバー元」のマトリクスを導出する。
//
// covers ref の一次情報源は journal（06 2.3: refs は journal が正本）である。
// frontmatter refs は宣言入力であり、遷移前で journal 未取込のものを補うために
// 二次情報源として読む（取込は chain エンジニアが authoring.js 側で行う）。
// このモジュールは「読む側」に徹し、journal / frontmatter のいずれにも書かない。
//
// capability id の突合キーは cap-<slug> 形式であり、covers ref の to が
// この形（`:` を含まない cap- 始まり）のとき capability への被覆とみなす。
// to が spec:<id> / campaign:<id> のような <kind>:<id> 形式のときは
// artifact 間 coverage であり、capability 被覆の対象外とする。

// capability id の判定（cap-<slug>。<kind>:<id> 形式と区別する）。
export function isCapabilityRef(to) {
  if (typeof to !== 'string') return false;
  if (to.includes(':')) return false; // spec:s001 等は artifact ref
  return /^cap-[\w.-]+$/.test(to);
}

// ------------------------------------------------------------------
// Capabilities セクションのパース
// ------------------------------------------------------------------
// 記法: 各 capability を 1 チェックリスト項目で宣言する。
//   - [ ] cap-<slug>: 説明
//   - [x] cap-<slug>: 説明   （提供済みマーク。covers 判定には使わない）
// 説明（: 以降）は任意。id が突合キーであり、決定論的に抽出する。
// checkbox でない裸の箇条書き（- cap-x: ...）も後方互換で拾う。
const CAP_LINE = /^\s*[-*]\s*(?:\[( |x|X)\]\s*)?(cap-[\w.-]+)\s*(?::\s*(.*))?$/;

export function parseCapabilities(visionBody) {
  const section = extractSection(visionBody, 'Capabilities');
  if (section == null) return [];
  const out = [];
  const seen = new Set();
  for (const line of section.split('\n')) {
    const m = CAP_LINE.exec(line);
    if (!m) continue;
    const id = m[2];
    if (seen.has(id)) continue; // 同一 id の重複宣言は先勝ち（決定論）
    seen.add(id);
    out.push({
      id,
      checked: m[1] === 'x' || m[1] === 'X',
      desc: (m[3] || '').trim(),
    });
  }
  return out;
}

// ------------------------------------------------------------------
// authored payload のパス解決（authoring.js と同じ規約。読取専用）。
// ------------------------------------------------------------------
function findFileBySeq(root, dir, id) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return null;
  for (const entry of fs.readdirSync(abs)) {
    if (entry === `${id}.md` || entry.startsWith(`${id}-`)) return entry;
  }
  return null;
}
function findDirBySeq(root, dir, id) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return null;
  for (const entry of fs.readdirSync(abs)) {
    if (entry === id || entry.startsWith(`${id}-`)) return entry;
  }
  return null;
}
function visionBodyPath(root, id) {
  const f = findFileBySeq(root, 'vision', id);
  return f ? path.join('vision', f) : null;
}
function specBodyPath(root, id) {
  const d = findDirBySeq(root, 'specs', id);
  return d ? path.join('specs', d, 'spec.md') : null;
}
function campaignBodyPath(root, id) {
  const d = findDirBySeq(root, 'campaigns', id);
  return d ? path.join('campaigns', d, 'charter.md') : null;
}
function readManaged(root, relPath) {
  if (relPath == null) return null;
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

// ------------------------------------------------------------------
// frontmatter refs（宣言入力）の最小パース。covers ref のみ拾う。
// js-yaml に依存せず正規表現で covers 行を抽出する（読取・二次情報源のため軽量に）。
// authoring.js の normalizeRefs が扱う記法のうち covers/to を拾えれば十分。
// ------------------------------------------------------------------
function frontmatterBlock(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text || ''));
  return m ? m[1] : null;
}

// frontmatter から covers 先（to）の集合を返す。次の記法を許容する:
//   refs:
//     - { rel: covers, to: cap-export }
//     - covers cap-export
//     - covers: cap-export
//   refs:
//     covers: [cap-export, cap-import]
export function frontmatterCovers(text) {
  const block = frontmatterBlock(text);
  if (block == null) return [];
  const out = [];
  const push = (to) => {
    const t = String(to).trim().replace(/^["']|["']$/g, '');
    if (t) out.push(t);
  };
  // 形1: { rel: covers, to: X }
  const objRe = /rel:\s*["']?covers["']?\s*,\s*to:\s*["']?([\w.:-]+)["']?/g;
  let m;
  while ((m = objRe.exec(block)) !== null) push(m[1]);
  // 形2: 配列要素の文字列/単一キー記法 "- covers X" / "- covers: X"
  const strRe = /^\s*-\s*covers:?\s+([\w.:-]+)\s*$/gm;
  while ((m = strRe.exec(block)) !== null) push(m[1]);
  // 形3: map 記法 covers: [X, Y] または covers: X（配列要素でない行頭）
  const mapRe = /^\s*covers:\s*(\[.*\]|[\w.:-]+)\s*$/gm;
  while ((m = mapRe.exec(block)) !== null) {
    const val = m[1].trim();
    if (val.startsWith('[')) {
      for (const part of val.replace(/^\[|\]$/g, '').split(',')) push(part);
    } else {
      push(val);
    }
  }
  return [...new Set(out)];
}

// ------------------------------------------------------------------
// vision の Capabilities を集約する。
// 戻り値: { order: [capId...], byId: { capId: { id, vision, checked, desc } } }
// 複数 vision が同一 cap-id を宣言した場合は id 昇順で先に現れた vision が正本。
// ------------------------------------------------------------------
export function visionCapabilities(root, snapshot) {
  const byId = {};
  const order = [];

  const visionSubjects = Object.keys(snapshot.nodes)
    .filter((s) => subjectKind(s) === 'vision')
    .sort();

  for (const subject of visionSubjects) {
    const vid = subjectId(subject);
    const body = readManaged(root, visionBodyPath(root, vid));
    if (body == null) continue;
    for (const cap of parseCapabilities(body)) {
      if (byId[cap.id]) continue; // 先勝ち
      byId[cap.id] = { id: cap.id, vision: subject, checked: cap.checked, desc: cap.desc };
      order.push(cap.id);
    }
  }

  return { order, byId };
}

// ------------------------------------------------------------------
// covers 元（spec / campaign）から capability への被覆参照を集約する。
// journal 導出 refs（node.refs）を一次、frontmatter を二次（journal 未取込の補完）とする。
// 戻り値: { byCap: { capId: [{ ref, source }] }, all: [{ ref, to, source }] }
//   ref    = 'spec:<id>' | 'campaign:<id>'（covers 元）
//   to     = cap-<slug>（被覆先 capability）
//   source = 'journal' | 'frontmatter'
// ------------------------------------------------------------------
export function coverSources(root, snapshot) {
  const byCap = {};
  const all = [];
  const seen = new Set(); // `${ref}->${to}` の重複除去（journal 優先）

  const record = (ref, to, source) => {
    if (!isCapabilityRef(to)) return;
    const key = `${ref}->${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    (byCap[to] = byCap[to] || []).push({ ref, source });
    all.push({ ref, to, source });
  };

  const sourceSubjects = Object.keys(snapshot.nodes)
    .filter((s) => subjectKind(s) === 'spec' || subjectKind(s) === 'campaign')
    .sort();

  // 一次: journal 導出 refs
  for (const subject of sourceSubjects) {
    const node = snapshot.nodes[subject];
    for (const r of node.refs || []) {
      if (r && r.rel === 'covers') record(subject, r.to, 'journal');
    }
  }

  // 二次: frontmatter 宣言（journal 未取込の covers を補う）
  for (const subject of sourceSubjects) {
    const kind = subjectKind(subject);
    const id = subjectId(subject);
    const relPath = kind === 'spec' ? specBodyPath(root, id) : campaignBodyPath(root, id);
    const body = readManaged(root, relPath);
    if (body == null) continue;
    for (const to of frontmatterCovers(body)) record(subject, to, 'frontmatter');
  }

  // capability ごとのカバー元は決定論順（ref 昇順）に整える。
  for (const cap of Object.keys(byCap)) {
    byCap[cap].sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));
  }

  return { byCap, all };
}

// ------------------------------------------------------------------
// capability カバレッジ・マトリクス。
// vision の Capabilities（宣言正本）と covers 元（journal 一次 / frontmatter 二次）を
// 突き合わせ、各 capability のカバー状況を導出する。
//
// 戻り値:
//   {
//     capabilities: [{ id, vision, desc, checked, covered, covered_by: [{ ref, source }] }],
//     uncovered:    [capId...],                 // covers 元が 1 件も無い capability
//     orphan_covers:[{ ref, to, source }...],   // どの vision も宣言しない cap-id への covers
//   }
// ------------------------------------------------------------------
export function coverageMatrix(root, snapshot) {
  const caps = visionCapabilities(root, snapshot);
  const { byCap, all } = coverSources(root, snapshot);

  const capabilities = [];
  const uncovered = [];
  for (const id of caps.order) {
    const meta = caps.byId[id];
    const coveredBy = byCap[id] || [];
    const covered = coveredBy.length > 0;
    capabilities.push({
      id,
      vision: meta.vision,
      desc: meta.desc,
      checked: meta.checked,
      covered,
      covered_by: coveredBy,
    });
    if (!covered) uncovered.push(id);
  }

  // orphan: vision に宣言が無い cap-id を covers している参照。
  const declared = new Set(caps.order);
  const orphanCovers = all
    .filter((c) => !declared.has(c.to))
    .sort((a, b) => {
      if (a.to !== b.to) return a.to < b.to ? -1 : 1;
      return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
    });

  return { capabilities, uncovered, orphan_covers: orphanCovers };
}
