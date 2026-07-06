import { createHash } from 'node:crypto';

// sha256 (hex)
export function sha256(input) {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return createHash('sha256').update(buf).digest('hex');
}

// authored payload から frontmatter (--- ... ---) を除いた本文を返す
export function stripFrontmatter(text) {
  const src = String(text == null ? '' : text);
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(src);
  if (m && m.index === 0) {
    return src.slice(m[0].length);
  }
  return src;
}

// 空白正規化: CRLF/CR -> LF、行末空白除去、連続空行の圧縮、前後トリム
export function normalizeWhitespace(text) {
  const src = String(text == null ? '' : text);
  const lf = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = lf.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));
  const collapsed = lines.join('\n').replace(/\n{3,}/g, '\n\n');
  return collapsed.trim();
}

// content-hash: frontmatter 除外 + 空白正規化した本文の sha256
export function contentHash(text) {
  return sha256(normalizeWhitespace(stripFrontmatter(text)));
}
