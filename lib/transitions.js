import { append } from './journal.js';
import { refuse } from './refuse.js';
import { autoCommit } from './gitops.js';

// 遷移を試みる。guard fn 群をすべて実行し、
//  - 全 pass -> transitioned event（data.guard_results に全結果を焼込）を append + autoCommit
//  - fail あり -> refuse を throw（journal へは書かない）
//
// opts: {
//   subject, from, to,
//   guards: [ (ctx) -> { name, pass, detail } ],
//   ctx?,                         // guard fn へ渡す文脈
//   actor?,                       // 既定 { kind: 'agent' }
//   command?,                     // 拒否メッセージ用のコマンド名
//   next?,                        // 拒否時に提示する次の一手（string[] | (failed)=>string[]）
//   refs?,                        // transitioned event に載せる refs
//   autoCommit?: bool,            // 既定 true
//   commitMessage?,               // 既定 "<subject> <from>-><to>"
// }
export function attempt(root, opts) {
  const {
    subject,
    from,
    to,
    guards = [],
    ctx = {},
    actor = { kind: 'agent' },
    command = `transition ${subject}`,
    next,
    refs,
    commitMessage,
  } = opts;
  const doCommit = opts.autoCommit !== false;

  const guardResults = [];
  const failed = [];
  for (const fn of guards) {
    let result;
    try {
      result = fn(ctx);
    } catch (e) {
      result = { name: fn.name || 'guard', pass: false, detail: `例外: ${e.message}` };
    }
    if (!result || typeof result.pass !== 'boolean') {
      result = { name: (result && result.name) || fn.name || 'guard', pass: false, detail: 'guard が不正な結果を返しました' };
    }
    guardResults.push(result);
    if (!result.pass) failed.push(result);
  }

  if (failed.length > 0) {
    const missing = failed.map((r) => ({ input: r.name, detail: r.detail || '不成立' }));
    const nextCmds = typeof next === 'function' ? next(failed) : next || [];
    throw refuse(command, missing, nextCmds);
  }

  const event = {
    type: 'transitioned',
    subject,
    actor,
    data: { from, to, guard_results: guardResults },
  };
  if (refs) event.refs = refs;
  const eventId = append(root, event);

  if (doCommit) {
    autoCommit(root, commitMessage || `${subject} ${from}->${to}`);
  }

  return { eventId, guardResults };
}
