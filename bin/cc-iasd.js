#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { findRoot } from '../lib/paths.js';
import { Refusal } from '../lib/refuse.js';
import { WritePathError } from '../lib/writePath.js';

const VERSION = '0.1.0';
const libDir = path.resolve(fileURLToPath(new URL('../lib', import.meta.url)));

// トップレベルコマンド -> 担当モジュール（lib/commands/*）の対応。
// 実際のハンドラは次フェーズで実装される。ここでは動的 import を試み、
// 未実装なら「未実装」表示 + exit 1 とする。
const COMMAND_MODULE = {
  init: 'init',
  doctor: 'doctor',
  new: 'authoring',
  spec: 'authoring',
  campaign: 'authoring',
  retire: 'authoring',
  run: 'run',
  session: 'run',
  decide: 'humans',
  gap: 'humans',
  review: 'humans',
  status: 'views',
  inbox: 'views',
  report: 'views',
  role: 'views',
};

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function fail(message, code = 1) {
  process.stderr.write(message + '\n');
  process.exit(code);
}

// Refusal を人間可読 / --json で出力し exit 2。
function emitRefusal(refusal, jsonMode) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(refusal.toJSON()) + '\n');
  } else {
    process.stderr.write(refusal.toHuman() + '\n');
  }
  process.exit(refusal.exitCode || 2);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    // 引数なし = human inbox（views 担当）。
    argv.push('inbox');
  }

  if (argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(usage());
    process.exit(0);
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(VERSION + '\n');
    process.exit(0);
  }

  const command = argv[0];
  const rest = argv.slice(1);
  const { positional, flags } = parseArgs(rest);
  const jsonMode = !!flags.json;

  const moduleName = COMMAND_MODULE[command];
  if (!moduleName) {
    fail(`未知のコマンド: ${command}\n${usage()}`, 1);
    return;
  }

  const root = flags.root ? path.resolve(String(flags.root)) : findRoot();

  const modPath = path.join(libDir, 'commands', `${moduleName}.js`);
  if (!fs.existsSync(modPath)) {
    // 次フェーズ担当。コマンド surface は確定しているが実装は未提供。
    fail(`未実装: ${command}（lib/commands/${moduleName}.js は次フェーズで実装）`, 1);
    return;
  }

  let mod;
  try {
    mod = await import(modPath);
  } catch (e) {
    fail(`コマンドモジュール読込失敗: ${moduleName}: ${e.message}`, 1);
    return;
  }

  // ハンドラ規約: 各モジュールは run(command, { positional, flags, root, jsonMode }) を公開する。
  const handler = mod.run || mod.default;
  if (typeof handler !== 'function') {
    fail(`未実装: ${command}（${moduleName}.run が未定義）`, 1);
    return;
  }

  try {
    await handler({ command, positional, flags, root, jsonMode });
  } catch (e) {
    if (e instanceof Refusal || e.isRefusal) {
      emitRefusal(e, jsonMode);
      return;
    }
    if (e instanceof WritePathError || e.isWritePathError) {
      fail(`書込拒否: ${e.message}`, 1);
      return;
    }
    fail(`エラー: ${e.message}`, 1);
  }
}

function usage() {
  return `cc-iasd ${VERSION}

Usage:
  cc-iasd                                        引数なし = human inbox
  cc-iasd init [project-context-path]
  cc-iasd doctor
  cc-iasd status [--plan | <ref>]
  cc-iasd new vision|spec|campaign <slug>
  cc-iasd spec ready <id>
  cc-iasd campaign launch|close <id>
  cc-iasd run open <campaign-id> --tasks <T..> | --adhoc "<goal>" --check "<cmd>" [--spike]
  cc-iasd run handoff|return|verify|accept|block|escalate <run-id>
  cc-iasd session start|resume <run-id>
  cc-iasd review record <ref> --gate spec|launch|run|completion
  cc-iasd gap add|close|route <ref>
  cc-iasd decide <decision-id> [--adopt <file>]
  cc-iasd report <ref>
  cc-iasd retire <ref>
  cc-iasd role show planner|worker|reviewer

Options:
  --root <path>   project-context root（既定: journal/ を持つ上位ディレクトリを探索）
  --json          機械可読出力
`;
}

main();
