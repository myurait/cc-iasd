// frontmatter refs の正規化を一実装に集約する（設計 06 2.3）。
// authoring（遷移時の journal 写像）と doctor（frontmatter-refs 整合検査）が
// 同一のセマンティクスで refs を扱うため、正規化ロジックはここに一本化する。
//
// 対応する frontmatter refs の形式:
//   - [{rel, to}]                     … 明示 {rel, to}
//   - ["upstream vision:v001", ...]   … 空白区切り列挙（rel を省くと rel='ref'）
//   - [{ upstream: 'vision:v001' }]   … 単一キー map の配列要素（08 7 章の author 記法）
//   - { upstream: ['vision:v001'] }   … map 形式（refs: { upstream: x }）
// 値が配列のキーは各要素を展開する。null 値は落とす。
// 戻り値は正規形 [{rel, to}] の配列。
export function normalizeRefs(raw) {
  const out = [];
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (typeof r === 'string') {
        // "upstream vision:v001" / "vision:v001"（空白区切り列挙）。
        const parts = r.trim().split(/\s+/);
        if (parts.length >= 2) out.push({ rel: parts[0], to: parts[1] });
        else out.push({ rel: 'ref', to: parts[0] });
      } else if (r && typeof r === 'object') {
        if (r.to != null) {
          // 明示 {rel, to} 形式。
          out.push({ rel: r.rel || 'ref', to: String(r.to) });
        } else {
          // 単一キー map の配列要素「- upstream: vision:v001」（08 7 章の author 記法）。
          // YAML は各要素を { upstream: 'vision:v001' } のオブジェクトへ読む。
          // key=rel, value=to として正規化し、この自然記法を確実に取り込む。
          for (const [rel, to] of Object.entries(r)) {
            if (to == null) continue;
            const list = Array.isArray(to) ? to : [to];
            for (const t of list) if (t != null) out.push({ rel, to: String(t) });
          }
        }
      }
    }
  } else if (raw && typeof raw === 'object') {
    // map 形式「refs: { upstream: x }」。
    for (const [rel, val] of Object.entries(raw)) {
      const list = Array.isArray(val) ? val : [val];
      for (const to of list) if (to != null) out.push({ rel, to: String(to) });
    }
  }
  return out;
}

// 正規化した refs（[{rel,to}]）を rel:to の文字列集合へ写す。
// 比較用（doctor の fm ⊆ journal 整合検査）に使う。
export function refKeySet(refs) {
  const set = new Set();
  for (const r of normalizeRefs(refs)) {
    set.add(`${r.rel}:${r.to}`);
  }
  return set;
}

export function refsByRel(refs, rel) {
  return normalizeRefs(refs)
    .filter((r) => r.rel === rel)
    .map((r) => r.to);
}
