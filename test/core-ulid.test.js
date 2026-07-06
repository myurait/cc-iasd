import test from 'node:test';
import assert from 'node:assert/strict';
import { ulid, slugify } from '../lib/ulid.js';

test('ulid は 26 文字の Crockford base32', () => {
  const id = ulid();
  assert.equal(id.length, 26);
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
});

test('ulid は時刻昇順で辞書順も昇順', () => {
  const a = ulid(1000);
  const b = ulid(2000);
  assert.ok(a < b, `${a} < ${b}`);
});

test('ulid は乱数部で衝突しない', () => {
  const set = new Set();
  for (let i = 0; i < 1000; i++) set.add(ulid(1000));
  assert.equal(set.size, 1000);
});

test('slugify は英数と - に正規化', () => {
  assert.equal(slugify('CSV Export!!'), 'csv-export');
  assert.equal(slugify('  日本語  '), 'x');
  assert.equal(slugify('a--b__c'), 'a-b-c');
});
