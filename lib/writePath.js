import path from 'node:path';
import fs from 'node:fs';
import { MANAGED_DIRS, MANAGED_FILES } from './paths.js';

// 書込先が管理領域 allowlist に含まれるかを判定する。
// relPath は root 起点の相対パス。allowlist 外（src/ reference/ など）は例外。
export class WritePathError extends Error {
  constructor(relPath, reason) {
    super(`書込拒否: ${relPath}（${reason}）`);
    this.name = 'WritePathError';
    this.isWritePathError = true;
    this.relPath = relPath;
  }
}

// relPath を正規化し root 外への脱出を禁じる。
function resolveInside(root, relPath) {
  const normalized = path.normalize(relPath).replace(/^[/\\]+/, '');
  const abs = path.resolve(root, normalized);
  const rootAbs = path.resolve(root);
  const rel = path.relative(rootAbs, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new WritePathError(relPath, 'project-context root の外です');
  }
  return { abs, rel };
}

// allowlist 判定: 先頭セグメントが MANAGED_DIRS のいずれか、または MANAGED_FILES 完全一致。
export function isAllowed(relPath) {
  const rel = path.normalize(relPath).replace(/^[/\\]+/, '');
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length === 0) return false;
  const top = parts[0];
  if (MANAGED_FILES.includes(top) && parts.length === 1) return true;
  if (MANAGED_DIRS.includes(top)) return true;
  return false;
}

function assertAllowed(root, relPath) {
  const { abs, rel } = resolveInside(root, relPath);
  if (!isAllowed(rel)) {
    throw new WritePathError(rel, '管理領域 allowlist の外です（src/ reference/ 等）');
  }
  return abs;
}

// 管理領域へ content を書き込む。allowlist 外は WritePathError。
export function write(root, relPath, content) {
  const abs = assertAllowed(root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

// 管理領域のファイルを削除する。allowlist 外は WritePathError。
export function rm(root, relPath) {
  const abs = assertAllowed(root, relPath);
  fs.rmSync(abs, { recursive: true, force: true });
  return abs;
}

// 管理領域のディレクトリを作成する。
export function mkdir(root, relPath) {
  const abs = assertAllowed(root, relPath);
  fs.mkdirSync(abs, { recursive: true });
  return abs;
}
