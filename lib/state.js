import { subjectKind, subjectId } from './journal.js';

// created 時の初期状態（設計 05 2 章の状態列）。
const INITIAL_STATUS = {
  vision: 'draft',
  spec: 'draft',
  campaign: 'draft',
  run: 'created',
  decision: 'open',
};

// events を時系列で畳み込み、導出 snapshot を返す。
// 戻り値: { nodes, gaps, runs, reviews, verifications }
export function derive(events) {
  const nodes = {}; // "<kind>:<id>" -> { status, hash?, refs, reject_count?, ... }
  const gaps = {}; // "gNNN" -> { kind, route, blocking, status }
  const runs = {}; // "<run-id>" -> { status, campaign?, spec?, repos, type }
  // 補助索引
  const reviews = {}; // "<subject>" -> { "<gate>": sha256 }
  const verifications = {}; // "<run-id>" -> { pass, verifyId }

  const ordered = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const ev of ordered) {
    const kind = subjectKind(ev.subject);
    switch (ev.type) {
      case 'created': {
        if (kind === 'gap') {
          // created が gap を作る経路は無い（gap.opened が正本）。念のため無視。
          break;
        }
        const node = nodes[ev.subject] || { refs: [] };
        node.status = INITIAL_STATUS[kind] || 'draft';
        node.refs = ev.refs ? [...ev.refs] : node.refs || [];
        nodes[ev.subject] = node;
        if (kind === 'run') {
          const rid = subjectId(ev.subject);
          const run = runs[rid] || { repos: {} };
          run.status = 'created';
          run.type = (ev.data && ev.data.type) || 'normal';
          if (ev.data && ev.data.campaign) run.campaign = ev.data.campaign;
          if (ev.data && ev.data.spec) run.spec = ev.data.spec;
          // task は単数（data.task）と複数（data.tasks 配列）の双方を受ける。
          // run open は data.tasks に配列を焼く（claim / coverage の排他判定入力）。
          if (ev.data && Array.isArray(ev.data.tasks)) run.tasks = ev.data.tasks;
          if (ev.data && ev.data.task) run.task = ev.data.task;
          // surface（write/forbid glob）は write-glob 交差ガードの入力。
          if (ev.data && ev.data.surface) run.surface = ev.data.surface;
          if (ev.data && ev.data.repos) {
            for (const [name, base] of Object.entries(ev.data.repos)) {
              run.repos[name] = base;
            }
          }
          runs[rid] = run;
        }
        break;
      }
      case 'revised': {
        const node = nodes[ev.subject] || { refs: [] };
        if (ev.payload && ev.payload.sha256) node.hash = ev.payload.sha256;
        if (ev.refs) node.refs = [...ev.refs];
        nodes[ev.subject] = node;
        break;
      }
      case 'transitioned': {
        const node = nodes[ev.subject] || { refs: [] };
        const to = ev.data && ev.data.to;
        if (to) node.status = to;
        nodes[ev.subject] = node;
        if (kind === 'run') {
          const rid = subjectId(ev.subject);
          const run = runs[rid] || { repos: {} };
          if (to) run.status = to;
          // reject 階梯: blocked への遷移で reject_count を加算。
          if (to === 'blocked') {
            node.reject_count = (node.reject_count || 0) + 1;
            run.reject_count = node.reject_count;
          }
          runs[rid] = run;
        }
        break;
      }
      case 'verify.recorded': {
        const rid = subjectId(ev.subject);
        const run = runs[rid] || { repos: {} };
        const pass = !!(ev.data && ev.data.pass);
        verifications[rid] = { pass, verifyId: ev.id };
        run.verification = { pass };
        runs[rid] = run;
        break;
      }
      case 'review.recorded': {
        const gate = ev.data && ev.data.gate;
        const sha = ev.payload && ev.payload.sha256;
        if (gate) {
          reviews[ev.subject] = reviews[ev.subject] || {};
          reviews[ev.subject][gate] = sha;
        }
        break;
      }
      case 'gap.opened': {
        const gid = subjectId(ev.subject);
        const g = gaps[gid] || {};
        const d = ev.data || {};
        g.kind = d.kind;
        g.route = d.route || 'none';
        g.blocking = !!d.blocking;
        g.source = d.source;
        g.target = d.target; // gap が指す対象 artifact ref
        g.status = 'open';
        gaps[gid] = g;
        break;
      }
      case 'gap.closed': {
        const gid = subjectId(ev.subject);
        const g = gaps[gid] || {};
        const to = (ev.data && ev.data.to) || 'closed';
        g.status = to; // closed / routed / deferred
        gaps[gid] = g;
        break;
      }
      case 'decision.recorded': {
        const node = nodes[ev.subject] || { refs: [] };
        node.status = 'decided';
        if (ev.refs) node.refs = [...ev.refs];
        nodes[ev.subject] = node;
        break;
      }
      case 'commit.observed': {
        const rid = subjectId(ev.subject);
        const run = runs[rid] || { repos: {} };
        const d = ev.data || {};
        if (d.repos) {
          for (const [name, base] of Object.entries(d.repos)) {
            run.repos[name] = base;
          }
        }
        runs[rid] = run;
        break;
      }
      case 'session.started':
      case 'session.resumed':
      case 'note.appended':
        // 状態列を進めない event。畳み込み対象外。
        break;
      default:
        break;
    }
  }

  return { nodes, gaps, runs, reviews, verifications };
}

// 特定 subject を対象とする open な blocking gap の一覧を返す。
export function blockingGapsFor(snapshot, targetRef) {
  const out = [];
  for (const [gid, g] of Object.entries(snapshot.gaps)) {
    if (g.status === 'open' && g.blocking && g.target === targetRef) {
      out.push(gid);
    }
  }
  return out;
}
