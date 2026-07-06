import { randomBytes } from 'node:crypto';

// Crockford Base32 (I/L/O/U を除く 32 文字)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10; // 48bit -> 10 chars
const RAND_LEN = 16; // 80bit -> 16 chars

function encodeTime(now) {
  let str = '';
  let t = now;
  for (let i = 0; i < TIME_LEN; i++) {
    const mod = t % 32;
    str = ENCODING[mod] + str;
    t = (t - mod) / 32;
  }
  return str;
}

function encodeRandom() {
  const bytes = randomBytes(RAND_LEN);
  let str = '';
  for (let i = 0; i < RAND_LEN; i++) {
    str += ENCODING[bytes[i] % 32];
  }
  return str;
}

// 時刻 48bit + 乱数 80bit の 26 文字 ULID
export function ulid(now = Date.now()) {
  return encodeTime(now) + encodeRandom();
}

// slug 化（英数と - のみ、小文字化、連続 - の圧縮）
export function slugify(input) {
  const s = String(input == null ? '' : input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return s || 'x';
}
