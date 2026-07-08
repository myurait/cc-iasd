import path from 'node:path';
import { write } from '../writePath.js';

// adapter=none（既定）。Tier 0 の最小 bundle を out/<run-id>/ へ生成する。
// - compile: handoff + worker role card + repos base を連結した bundle.md を書く。
//   resume-brief があれば末尾に連結する（resume 時）。
// - launch: 実プロセス起動はせず、人間可読の起動手順 note を返す。
//
// 3 不変条件（src 隔離 / evidence-first / no-guess backtrack）は adapter を
// 使わずとも Tier 0 の journal + writePath + refuse で閉じる。none はその最小形。

// bundle 本文を組む。runtime に依らず compile は常に成立する（canon「compile し」）。
function renderBundle(ctx, runId) {
  const parts = [];
  parts.push(`# bundle: ${runId}`);
  parts.push('');
  parts.push(`runtime adapter: none`);
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## handoff');
  parts.push('');
  parts.push((ctx.handoffMd || '').trim() || '(handoff なし)');
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## worker role card');
  parts.push('');
  parts.push((ctx.roleCard || '').trim() || '(role card なし)');
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## repos (base commit)');
  parts.push('');
  const entries = Object.entries(ctx.reposBase || {});
  if (entries.length === 0) {
    parts.push('(none)');
  } else {
    for (const [name, base] of entries) parts.push(`- ${name}: base=${base}`);
  }
  parts.push('');
  if (ctx.resumeBriefMd) {
    parts.push('---');
    parts.push('');
    parts.push('## resume brief');
    parts.push('');
    parts.push(ctx.resumeBriefMd.trim());
    parts.push('');
  }
  return parts.join('\n') + '\n';
}

export const adapter = {
  name: 'none',
  capability: {
    contextInjection: 'none',
    writeGuard: 'none',
    stopGate: 'none',
    journal: 'none',
  },

  // out/<run-id>/bundle.md を生成する。生成した相対パス群を返す。
  compile(root, runId, ctx) {
    const rel = path.join('out', runId, 'bundle.md');
    write(root, rel, renderBundle(ctx, runId));
    return { bundleDir: path.join('out', runId), files: [rel] };
  },

  // none は起動しない。src 外へ書かせない前提の手動起動手順を note で返す。
  launch(root, runId, ctx) {
    const bundleRel = path.join('out', runId, 'bundle.md');
    const lines = [
      `runtime adapter=none: 自動起動はしません。以下の手順で runtime を人間が起動してください。`,
      ``,
      `1. bundle を runtime へ渡す: ${bundleRel}`,
      `2. worker は src/ 配下のみ編集し、完了宣言はせず作業を止める。`,
      `3. 戻ってきたら: cc-iasd run return ${runId}`,
      `   その後: cc-iasd run verify ${runId}`,
    ];
    return {
      command: null,
      cwd: root,
      env: {},
      note: lines.join('\n'),
    };
  },
};

export default adapter;
