import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256, stripFrontmatter, normalizeWhitespace, contentHash } from '../lib/hash.js';

test('sha256 は既知ベクタと一致', () => {
  assert.equal(
    sha256(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

test('stripFrontmatter は先頭 --- ブロックを除去', () => {
  const md = '---\nid: s001\nrefs: []\n---\n本文\n';
  assert.equal(stripFrontmatter(md), '本文\n');
});

test('stripFrontmatter は frontmatter が無ければそのまま', () => {
  assert.equal(stripFrontmatter('# heading\n'), '# heading\n');
});

test('normalizeWhitespace は CRLF/行末空白/連続空行を正規化', () => {
  const a = normalizeWhitespace('a  \r\n\r\n\r\nb\n');
  assert.equal(a, 'a\n\nb');
});

test('contentHash は frontmatter/refs 変更で不変', () => {
  const a = '---\nid: s001\nrefs: []\n---\n# spec\n本文\n';
  const b = '---\nid: s001\nrefs:\n  - upstream: v001\n---\n# spec\n本文\n';
  assert.equal(contentHash(a), contentHash(b));
});

test('contentHash は軽微な整形（行末空白/CRLF/前後空行）で不変、本文変更で変化', () => {
  const base = '# spec\n本文\n';
  const reformatted = '\r\n# spec  \r\n本文\t\r\n\r\n';
  const changed = '# spec\n別本文\n';
  assert.equal(contentHash(base), contentHash(reformatted));
  assert.notEqual(contentHash(base), contentHash(changed));
});
