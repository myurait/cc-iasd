import fs from 'node:fs';
import { load } from 'js-yaml';
import { configPath } from './paths.js';

// cc-iasd.yaml の既定値（契約 4 章 / 5 章の P1 確定バッチ）。
export const DEFAULTS = {
  doc_lang: 'Japanese',
  dev_lang: 'TypeScript',
  repos: [],
  budgets: {
    max_minutes: 90,
    no_progress_runs: 2,
    session_stale_minutes: 15,
  },
  reject_limit: 2,
  checks_allowlist: ['npm ', 'npx ', 'node ', 'git '],
  gates: { spec: 'required', run: 'required' }, // launch / completion は常に required（変更不可）
  runtime: { adapter: 'none' }, // P1 は none のみ
  decision: { require_tty: true, allow_adopt: false },
};

function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

// 欠落キーを既定値で深く補完する。
function mergeDefaults(raw) {
  const cfg = {
    doc_lang: raw.doc_lang ?? DEFAULTS.doc_lang,
    dev_lang: raw.dev_lang ?? DEFAULTS.dev_lang,
    repos: Array.isArray(raw.repos) ? raw.repos : DEFAULTS.repos,
    budgets: {
      ...DEFAULTS.budgets,
      ...(isObject(raw.budgets) ? raw.budgets : {}),
    },
    reject_limit: Number.isFinite(raw.reject_limit) ? raw.reject_limit : DEFAULTS.reject_limit,
    checks_allowlist: Array.isArray(raw.checks_allowlist)
      ? raw.checks_allowlist
      : DEFAULTS.checks_allowlist,
    // launch / completion は常に required（変更不可）。config 値は無視して固定する。
    gates: {
      spec: (isObject(raw.gates) && raw.gates.spec) || DEFAULTS.gates.spec,
      run: (isObject(raw.gates) && raw.gates.run) || DEFAULTS.gates.run,
      launch: 'required',
      completion: 'required',
    },
    runtime: {
      ...DEFAULTS.runtime,
      ...(isObject(raw.runtime) ? raw.runtime : {}),
    },
    decision: {
      ...DEFAULTS.decision,
      ...(isObject(raw.decision) ? raw.decision : {}),
    },
  };
  return cfg;
}

// 構造検証。逸脱があれば Error を投げる。
export function validate(cfg) {
  const errors = [];
  if (typeof cfg.doc_lang !== 'string') errors.push('doc_lang は文字列であること');
  if (typeof cfg.dev_lang !== 'string') errors.push('dev_lang は文字列であること');
  if (!Array.isArray(cfg.repos)) errors.push('repos は配列であること');
  for (const r of cfg.repos) {
    if (!isObject(r) || typeof r.name !== 'string' || typeof r.path !== 'string') {
      errors.push('repos の各要素は { name, path } を持つこと');
      break;
    }
  }
  if (!Number.isFinite(cfg.budgets.max_minutes)) errors.push('budgets.max_minutes は数値であること');
  if (!Number.isFinite(cfg.budgets.no_progress_runs))
    errors.push('budgets.no_progress_runs は数値であること');
  if (!Number.isFinite(cfg.budgets.session_stale_minutes))
    errors.push('budgets.session_stale_minutes は数値であること');
  if (!Number.isFinite(cfg.reject_limit)) errors.push('reject_limit は数値であること');
  if (!Array.isArray(cfg.checks_allowlist)) errors.push('checks_allowlist は配列であること');
  if (cfg.runtime.adapter !== 'none') errors.push('P1 では runtime.adapter は none のみ');
  if (errors.length > 0) {
    throw new Error(`cc-iasd.yaml 検証エラー:\n- ${errors.join('\n- ')}`);
  }
  return cfg;
}

// cc-iasd.yaml を読み込み、既定値で補完し、検証済み Config を返す。
// ファイルが無ければ既定値のみで構成する。
export function load_(root) {
  const p = configPath(root);
  let raw = {};
  if (fs.existsSync(p)) {
    const text = fs.readFileSync(p, 'utf8');
    const parsed = load(text);
    raw = isObject(parsed) ? parsed : {};
  }
  const cfg = mergeDefaults(raw);
  return validate(cfg);
}

// 契約シグネチャ config.load(root)
export { load_ as load };

// check コマンドが allowlist に適合するか（prefix match）。
export function checkAllowed(cfg, command) {
  const cmd = String(command == null ? '' : command);
  return cfg.checks_allowlist.some((prefix) => cmd.startsWith(prefix));
}
