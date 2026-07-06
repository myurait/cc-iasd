import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump } from 'js-yaml';
import { refuse } from '../refuse.js';
import * as writePath from '../writePath.js';
import { MANAGED_DIRS } from '../paths.js';
import { append } from '../journal.js';
import { initProjectContext, autoCommit } from '../gitops.js';

// 出荷資産（roles / templates）はパッケージ root 直下に置かれる。
// lib/commands/ から二段上がパッケージ root。
const PKG_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

// init が生成する scaffold ディレクトリ（03 2 章のフラット構成）。
// out/ と reference/ と src/ は用途が異なるため個別に扱う。
const SCAFFOLD_DIRS = [
  'journal',
  'vision',
  'specs',
  'campaigns',
  'runs',
  'evidence',
  'evidence/verifications',
  'evidence/reviews',
  'decisions',
  'gaps',
  'roles',
  'out',
];

const ROLE_CARDS = ['planner', 'worker', 'reviewer'];

// {{docLang}} を確定する。role card 内の他のプレースホルダは init では触らない。
function resolveDocLang(text, docLang) {
  return String(text).split('{{docLang}}').join(docLang);
}

// cc-iasd.yaml を schema 通りに構築する。config.DEFAULTS と整合する形。
function buildConfigYaml({ docLang, devLang, repos }) {
  const cfg = {
    doc_lang: docLang,
    dev_lang: devLang,
    repos,
    budgets: {
      max_minutes: 90,
      no_progress_runs: 2,
      session_stale_minutes: 15,
    },
    reject_limit: 2,
    checks_allowlist: ['npm ', 'npx ', 'node ', 'git '],
    gates: { spec: 'required', run: 'required' },
    runtime: { adapter: 'none' },
    decision: { require_tty: true, allow_adopt: false },
  };
  return dump(cfg, { lineWidth: -1 });
}

// --repo <name>:<path> を repos エントリへ。値なし / 単一値は name=path=値 とみなさず拒否誘導する。
// 複数指定は --repo を繰り返す（dispatcher の flags は最後の値のみを保持するため配列化は呼び出し側前提）。
function parseRepos(flags) {
  const raw = flags.repo;
  if (raw === undefined) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const repos = [];
  for (const item of list) {
    if (item === true) {
      throw refuse(
        'init',
        [{ input: '--repo', detail: '<name>:<src への相対パス> の形式で指定してください（例 --repo api:src/api）' }],
        ['cc-iasd init --repo api:src/api'],
      );
    }
    const s = String(item);
    const idx = s.indexOf(':');
    if (idx === -1) {
      // name 省略時は path の末尾セグメントを name にする。
      const p = s.replace(/^\/+|\/+$/g, '');
      const name = p.split('/').filter(Boolean).pop() || p;
      repos.push({ name, path: p });
    } else {
      const name = s.slice(0, idx).trim();
      const p = s.slice(idx + 1).trim();
      if (!name || !p) {
        throw refuse(
          'init',
          [{ input: '--repo', detail: `不正な指定です: ${s}（<name>:<path> の両方が必要）` }],
          ['cc-iasd init --repo api:src/api'],
        );
      }
      repos.push({ name, path: p });
    }
  }
  return repos;
}

export function run({ positional, flags, jsonMode }) {
  // 初期化先: 位置引数 or --root or cwd。
  const target = positional[0]
    ? path.resolve(String(positional[0]))
    : flags.root
      ? path.resolve(String(flags.root))
      : process.cwd();

  // 既存 project-context への再 init を拒否する（journal 存在で判定）。
  if (fs.existsSync(path.join(target, 'journal'))) {
    throw refuse(
      'init',
      [{ input: 'target', detail: `${target} は既に project-context です（journal/ が存在）` }],
      ['cc-iasd doctor'],
    );
  }

  const docLang = flags['doc-lang'] ? String(flags['doc-lang']) : 'Japanese';
  const devLang = flags['dev-lang'] ? String(flags['dev-lang']) : 'TypeScript';
  const repos = parseRepos(flags);

  fs.mkdirSync(target, { recursive: true });

  // scaffold ディレクトリ。空ディレクトリは git に残らないため .gitkeep を置く。
  for (const dir of SCAFFOLD_DIRS) {
    writePath.mkdir(target, dir);
    if (dir !== 'journal') {
      writePath.write(target, path.join(dir, '.gitkeep'), '');
    }
  }

  // cc-iasd.yaml（--doc-lang / --dev-lang / --repo を反映）。
  const configYaml = buildConfigYaml({ docLang, devLang, repos });
  writePath.write(target, 'cc-iasd.yaml', configYaml);

  // roles/ 3 cards を出荷資産から複製し {{docLang}} を確定する。
  for (const role of ROLE_CARDS) {
    const srcCard = path.join(PKG_ROOT, 'roles', `${role}.md`);
    if (!fs.existsSync(srcCard)) {
      throw new Error(`出荷資産が見つかりません: roles/${role}.md`);
    }
    const resolved = resolveDocLang(fs.readFileSync(srcCard, 'utf8'), docLang);
    writePath.write(target, path.join('roles', `${role}.md`), resolved);
  }

  // journal 初期化: init 自身の記録を append する。
  // project-context の作成は状態遷移ではないため created で subject=project:root を刻む。
  append(target, {
    type: 'created',
    subject: 'project:root',
    actor: { kind: 'cli' },
    data: { doc_lang: docLang, dev_lang: devLang, repos },
  });

  // git init + .gitignore（src/ と out/）+ 初回 commit。
  initProjectContext(target);
  const sha = autoCommit(target, 'init: project-context 初期化');

  const result = {
    ok: true,
    command: 'init',
    root: target,
    doc_lang: docLang,
    dev_lang: devLang,
    repos,
    commit: sha,
  };

  if (jsonMode) {
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    const lines = [
      `project-context を初期化しました: ${target}`,
      `  doc_lang: ${docLang} / dev_lang: ${devLang}`,
    ];
    if (repos.length > 0) {
      lines.push('  repos:');
      for (const r of repos) lines.push(`    - ${r.name}: ${r.path}`);
    }
    if (sha) lines.push(`  初回 commit: ${sha.slice(0, 12)}`);
    lines.push('次に打つコマンド:');
    lines.push('  $ cc-iasd doctor');
    process.stdout.write(lines.join('\n') + '\n');
  }
}

export default run;
