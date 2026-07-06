import path from 'node:path';
import fs from 'node:fs';

// 管理領域のトップレベル allowlist（契約 3 章 / 設計 03 5 章）。
// これらのディレクトリ配下、および直下の allowlist ファイルのみ writePath が書ける。
export const MANAGED_DIRS = [
  'vision',
  'specs',
  'campaigns',
  'runs',
  'evidence',
  'decisions',
  'gaps',
  'roles',
  'journal',
  'out',
];

// 管理領域のトップレベルファイル（ディレクトリではないもの）。
export const MANAGED_FILES = ['state.json', 'cc-iasd.yaml'];

// 非管理領域（writePath 対象外。書込は例外送出）。
export const UNMANAGED_DIRS = ['src', 'reference'];

// project-context root を示すマーカー（journal ディレクトリの存在で判定）。
export const ROOT_MARKER = 'journal';

// 相対パス（root 起点）を返すヘルパ。
export function journalDir(root) {
  return path.join(root, 'journal');
}
export function statePath(root) {
  return path.join(root, 'state.json');
}
export function configPath(root) {
  return path.join(root, 'cc-iasd.yaml');
}
export function rolesDir(root) {
  return path.join(root, 'roles');
}
export function outDir(root) {
  return path.join(root, 'out');
}
export function runDir(root, runId) {
  return path.join(root, 'runs', runId);
}
export function evidenceVerificationsDir(root, runId) {
  return path.join(root, 'evidence', 'verifications', runId);
}
export function srcDir(root) {
  return path.join(root, 'src');
}

// 指定ディレクトリから上方向に journal/ を持つ project-context root を探索する。
// 見つからなければ null。
export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(dir, ROOT_MARKER))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
