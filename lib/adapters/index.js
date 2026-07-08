// runtime adapter の解決口（設計 02 6.2 / 09 3 章）。
// adapter は Tier 1 の optional 加速層であり、session コマンド本体（Tier 0）は
// adapter=none でも bundle compile + journal 記録 + 起動手順案内で完結する。
//
// adapter interface:
//   {
//     name,                                       // 'none' | 'claude-code'
//     capability: { contextInjection, writeGuard, stopGate, journal },
//                                                 // 各値 'hook' | 'wrapper' | 'none'
//     compile(root, runId, ctx) -> { bundleDir, files: [rel...] },
//                                                 // out/<run-id>/ へ bundle 生成
//     launch(root, runId, ctx)  -> { command, cwd, env, note },
//                                                 // 起動情報（none は note 主体）
//   }
//
// ctx は session.js が組む文脈:
//   { cfg, snap, handoffMd, roleCard, reposBase, docLang, resumeBriefMd? }
import { adapter as noneAdapter } from './none.js';
import { adapter as claudeCodeAdapter } from './claude-code.js';

const REGISTRY = {
  none: noneAdapter,
  'claude-code': claudeCodeAdapter,
};

// 許容 adapter 名（config validate 緩和と同一集合）。
// codex は将来拡張（09 3 章）。現状は解決不能だが名前だけ許容する。
export const KNOWN_ADAPTERS = ['none', 'claude-code', 'codex'];

// 名前から adapter オブジェクトを返す。未実装（codex 等）は none にフォールバックし、
// fallback フラグを立てて呼び出し側が案内できるようにする。
export function resolveAdapter(name) {
  const key = name || 'none';
  if (REGISTRY[key]) return REGISTRY[key];
  // 既知だが未実装（codex）は none 実装で代替する。
  if (KNOWN_ADAPTERS.includes(key)) {
    return { ...noneAdapter, name: key, fallback: 'none' };
  }
  // 未知名は none。
  return { ...noneAdapter, name: 'none', requested: key, fallback: 'none' };
}
