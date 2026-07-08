import path from 'node:path';
import { write } from '../writePath.js';
import { adapter as noneAdapter } from './none.js';

// adapter=claude-code（Tier 1 optional 加速層。設計 02 6.2 / 09 3 章）。
// none の最小 bundle（bundle.md）に加えて、claude-code runtime 向けの
// settings / hook を out/<run-id>/settings/ へ生成し、launch 情報を返す。
//
// このアダプタは「実プロセス起動」はしない（起動は runtime 環境依存）。
// compile で settings/hook を生成し、launch でその起動コマンド案内を返すところまで。
//
// capability（各能力をどの機構で満たすか）:
//   contextInjection: 'hook'  … session start hook で bundle を context 注入
//   writeGuard:       'hook'  … PreToolUse hook で src/ 外・forbid glob 書込を deny
//   stopGate:         'hook'  … STOP ファイル存在で作業継続を止める
//   journal:          'none'  … journal 追記は Tier 0（cc-iasd CLI）が所有し hook 化しない

// PreToolUse で src 外書込を拒否する最小 hook スクリプト（決定論）。
// worktree_contract の Tier 1（src/ 隔離）と統合する: 書込先が src/ 配下でなければ deny。
function renderWriteGuardHook() {
  return [
    '#!/usr/bin/env node',
    '// cc-iasd claude-code adapter: PreToolUse write-guard hook。',
    '// 標準入力で tool 呼び出し JSON を受け、Write/Edit 系の対象 path が',
    "// src/ 配下でなければ deny する（3 不変条件の src 隔離を runtime 側でも二重化）。",
    'let raw = "";',
    'process.stdin.on("data", (c) => (raw += c));',
    'process.stdin.on("end", () => {',
    '  let ev = {};',
    '  try { ev = JSON.parse(raw || "{}"); } catch { ev = {}; }',
    '  const input = (ev && ev.tool_input) || {};',
    '  const target = input.file_path || input.path || "";',
    '  const isWrite = /Write|Edit|MultiEdit|NotebookEdit/.test((ev && ev.tool_name) || "");',
    '  if (isWrite && target && !/(^|\\/)src\\//.test(String(target))) {',
    '    process.stdout.write(JSON.stringify({',
    '      decision: "block",',
    '      reason: "cc-iasd: src/ 配下以外への書込は禁止です",',
    '    }) + "\\n");',
    '    process.exit(0);',
    '  }',
    '  process.exit(0);',
    '});',
    '',
  ].join('\n');
}

// settings.json（claude-code の hook 登録 + context 注入指定）。
// 実キーは runtime 側のスキーマ依存だが、決定論的に固定形を書く。
function renderSettings(runId, ctx) {
  const settings = {
    // cc-iasd が生成した bundle を session の追加 context として注入する指定。
    cc_iasd: {
      run: runId,
      bundle: path.join('out', runId, 'bundle.md'),
      base: ctx.reposBase || {},
    },
    hooks: {
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit|NotebookEdit',
          hooks: [
            {
              type: 'command',
              command: `node ${path.join('out', runId, 'settings', 'write-guard.mjs')}`,
            },
          ],
        },
      ],
    },
  };
  return JSON.stringify(settings, null, 2) + '\n';
}

export const adapter = {
  name: 'claude-code',
  capability: {
    contextInjection: 'hook',
    writeGuard: 'hook',
    stopGate: 'hook',
    journal: 'none',
  },

  // none の bundle.md に加え、settings/settings.json と settings/write-guard.mjs を生成する。
  compile(root, runId, ctx) {
    // 最小 bundle は none と共有する（bundle.md）。
    const base = noneAdapter.compile(root, runId, ctx);
    const files = [...base.files];

    const settingsRel = path.join('out', runId, 'settings', 'settings.json');
    write(root, settingsRel, renderSettings(runId, ctx));
    files.push(settingsRel);

    const hookRel = path.join('out', runId, 'settings', 'write-guard.mjs');
    write(root, hookRel, renderWriteGuardHook());
    files.push(hookRel);

    return { bundleDir: base.bundleDir, files };
  },

  // 起動情報を返す（実起動はしない）。cwd は src 側 repo が単一なら repo path、
  // 複数/未確定なら project-context root。settings パスを --settings で渡す想定。
  launch(root, runId, ctx) {
    const settingsRel = path.join('out', runId, 'settings', 'settings.json');
    const repoNames = Object.keys(ctx.reposBase || {});
    // 単一 repo なら cwd をその repo に寄せる（config から path 解決は session.js が渡す）。
    const cwd = ctx.launchCwd || root;
    const command = `claude --settings ${path.join(root, settingsRel)}`;
    const noteLines = [
      `runtime adapter=claude-code: 以下の起動コマンドで runtime を開始してください（自動起動はしません）。`,
      ``,
      `$ ${command}`,
      ``,
      `- settings/hook: ${settingsRel}（src/ 外書込 deny + bundle context 注入）`,
      `- 対象 repo: ${repoNames.length ? repoNames.join(', ') : '(none)'}`,
      `- 戻り後: cc-iasd run return ${runId} -> cc-iasd run verify ${runId}`,
    ];
    return {
      command,
      cwd,
      env: {},
      note: noteLines.join('\n'),
    };
  },
};

export default adapter;
