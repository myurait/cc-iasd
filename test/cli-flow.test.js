import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const cliPath = path.join(repoRoot, 'bin/cc-iasd.js');

const runCli = (args) => execFileSync(process.execPath, [cliPath, ...args], {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

const createContext = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cc-iasd-test-'));
  runCli(['init', root, '--force']);
  return root;
};

const cleanup = async (root) => {
  await rm(root, { recursive: true, force: true });
};

const fillIdeal = async (root, idealId = 'i001-core') => {
  const idealPath = path.join(root, 'product/ideal', `${idealId}.md`);
  let content = await readFile(idealPath, 'utf8');
  content = content.replace('## Product Ideal\n\n- TBD', '## Product Ideal\n\n- Core product ideal.');
  content = content.replace('## Experience Principles\n\n- TBD', '## Experience Principles\n\n- Core experience principle.');
  content = content.replace('## Boundaries\n\n- TBD', '## Boundaries\n\n- Core product boundary.');
  await writeFile(idealPath, content, 'utf8');
};

test('init creates the product ops reference structure', async () => {
  const root = await createContext();
  try {
    runCli(['doctor', root]);

    assert.equal(existsSync(path.join(root, 'product/ideal')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/outdated')), true);
    assert.equal(existsSync(path.join(root, 'runtime/profile.md')), true);
    assert.equal(existsSync(path.join(root, 'runtime/plugins.yaml')), true);
    assert.equal(existsSync(path.join(root, 'runtime/adapters/role-runtime.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/execution/campaigns/archived')), true);
    assert.equal(existsSync(path.join(root, 'ops/execution/runs/archived')), true);
    assert.equal(existsSync(path.join(root, 'ops/evidence/reviews/archived')), true);
    assert.equal(existsSync(path.join(root, 'reference/INDEX.md')), true);
    assert.equal(existsSync(path.join(root, 'rules/templates/open_item_template.md')), true);
    assert.equal(existsSync(path.join(root, 'rules/templates/campaign_queue_template.md')), true);
    assert.equal(existsSync(path.join(root, 'rules/templates/ideal_interview_packet_template.md')), true);
    assert.equal(existsSync(path.join(root, 'rules/roles/ideal-interviewer.md')), true);
    assert.equal(existsSync(path.join(root, 'rules/roles/design-reviewer.md')), true);
    assert.equal(existsSync(path.join(root, 'rules/roles/execution-manager.md')), true);

    const projectPolicies = await readFile(path.join(root, 'rules/project-policies.md'), 'utf8');
    assert.match(projectPolicies, /## Source Projects/);
    assert.match(projectPolicies, /Primary Project Path: src\//);
    assert.match(projectPolicies, /## Artifact Creation Authority/);
    assert.match(projectPolicies, /AI agents may create and edit files under `src\/`/);

    const agents = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
    assert.match(agents, /## Artifact Rules/);
    assert.match(agents, /Use `cc-iasd` commands/);

    const roleRuntime = await readFile(path.join(root, 'runtime/adapters/role-runtime.md'), 'utf8');
    assert.match(roleRuntime, /rules\/roles\/design-reviewer\.md/);
    assert.match(roleRuntime, /rules\/roles\/ideal-interviewer\.md/);
    assert.match(roleRuntime, /rules\/roles\/worker\.md/);
    assert.match(roleRuntime, /rules\/roles\/planning-lead\.md/);
    assert.match(roleRuntime, /rules\/roles\/execution-manager\.md/);
    assert.match(roleRuntime, /## Command Visibility By Role/);
    assert.match(roleRuntime, /### design-reviewer/);
    assert.match(roleRuntime, /`cc-iasd review add <scope-id>`/);
    assert.match(roleRuntime, /### ideal-interviewer/);
    assert.match(roleRuntime, /`cc-iasd ideal add <id>`/);
    assert.match(roleRuntime, /### worker/);
    assert.match(roleRuntime, /`cc-iasd view run <run-id>`/);
    assert.match(roleRuntime, /## Context Compression Recovery/);
    assert.match(roleRuntime, /Planning Lead and Execution Manager are parallel entry points/);
    assert.match(roleRuntime, /Compressed handoff must preserve active role/);

    assert.equal(existsSync(path.join(root, 'ops/evidence-index.md')), false);
    assert.equal(existsSync(path.join(root, 'ops/milestones')), false);
    assert.equal(existsSync(path.join(root, 'ops/scopes/milestones')), false);
    assert.equal(existsSync(path.join(root, 'ops/cycles')), false);
    assert.equal(existsSync(path.join(root, 'ops/logs')), false);
  } finally {
    await cleanup(root);
  }
});

test('artifact commands write to the new structure and keep doctor green', async () => {
  const root = await createContext();
  try {
    runCli(['ideal', 'add', 'i001-core', '--summary', 'Core ideal', '--root', root]);
    await fillIdeal(root);
    runCli(['feature', 'add', 'f001-feature-a', '--kind', 'epic', '--summary', 'Add feature A', '--pillar', 'Core', '--root', root]);
    runCli(['roadmap', 'add', 'r001-roadmap-a', '--summary', 'Roadmap A', '--goal', 'Ship A', '--root', root]);
    runCli(['spec', 'add', 's001-spec-a', '--summary', 'Spec A', '--root', root]);
    runCli(['campaign', 'add', 'c001-campaign-a', '--summary', 'Campaign 1', '--feature', 'f001-feature-a', '--roadmap', 'r001-roadmap-a', '--spec', 's001-spec-a', '--tasks', 's001-spec-a', '--root', root]);
    const runOutput = runCli(['run', 'start', 'c001-campaign-a', '--root', root]);
    const runId = runOutput.match(/Prepared run (run_[0-9]{17}_c001-campaign-a)/)[1];
    runCli(['open-item', 'add', runId, '--kind', 'follow-up', '--summary', 'Follow up A', '--target', 'ops/scopes/features/f001-feature-a.md', '--root', root]);
    runCli(['open-item', 'resolve', runId, 'oi-001', '--resolution', 'resolved', '--summary', 'Handled', '--root', root]);
    runCli(['campaign', 'mark-run', 'c001-campaign-a', runId, '--status', 'completed', '--root', root]);
    runCli(['review', 'add', runId, '--type', 'full', '--review-mode', 'campaign-completion', '--summary', 'Review A', '--result', 'passed', '--root', root]);
    runCli(['escalate', runId, '--root', root]);
    runCli(['report', runId, '--root', root]);
    runCli(['reference', 'add', 'note', 'planning-note', '--summary', 'Planning note', '--root', root]);

    const evidenceView = runCli(['view', 'evidence', '--root', root]);
    assert.match(evidenceView, /# Evidence View/);
    assert.match(evidenceView, new RegExp(`ops/execution/runs/${runId}/state\\.md`));
    assert.match(evidenceView, /ops\/evidence\/reviews\/review_/);
    assert.equal(existsSync(path.join(root, 'ops/evidence-index.md')), false);

    const currentView = runCli(['view', 'current', '--root', root]);
    assert.match(currentView, /# Current View/);
    assert.match(currentView, /ops\/execution\/campaigns\/c001-campaign-a/);
    assert.match(currentView, new RegExp(`ops/execution/runs/${runId}`));

    const scopeView = runCli(['view', 'scope', 'f001-feature-a', '--root', root]);
    assert.match(scopeView, /# Scope Boundary View: f001-feature-a/);
    assert.match(scopeView, /## Feature Scope/);
    assert.match(scopeView, /## Roadmap Scope/);
    assert.match(scopeView, /## Spec/);
    assert.match(scopeView, /## Campaign Plan/);
    assert.match(scopeView, /## Run State/);
    assert.match(scopeView, new RegExp(`ops/execution/runs/${runId}/state\\.md`));

    const runView = runCli(['view', 'run', runId, '--root', root]);
    assert.match(runView, new RegExp(`# Run View: ${runId}`));
    assert.match(runView, /## State/);

    const feature = await readFile(path.join(root, 'ops/scopes/features/f001-feature-a.md'), 'utf8');
    assert.match(feature, /## Backlog/);
    assert.match(feature, /- Deferred: TBD/);
    assert.match(feature, /- Blocked: TBD/);
    assert.match(feature, /## Quality Requirements/);

    assert.equal(existsSync(path.join(root, 'product/specs/s001-spec-a/spec.md')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/s001-spec-a/research.md')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/s001-spec-a/data-model.md')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/s001-spec-a/contracts/README.md')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/s001-spec-a/tasks.md')), true);
    const spec = await readFile(path.join(root, 'product/specs/s001-spec-a/spec.md'), 'utf8');
    assert.match(spec, /## Source Trace/);
    assert.match(spec, /## Quality Requirements/);
    const specPlan = await readFile(path.join(root, 'product/specs/s001-spec-a/plan.md'), 'utf8');
    assert.match(specPlan, /## Implementation Boundaries/);
    const specTasks = await readFile(path.join(root, 'product/specs/s001-spec-a/tasks.md'), 'utf8');
    assert.match(specTasks, /## Task Quality Requirements/);

    const runState = await readFile(path.join(root, 'ops/execution/runs', runId, 'state.md'), 'utf8');
    assert.match(runState, /## Open Items/);
    assert.doesNotMatch(runState, /## Open Item Resolution/);
    assert.match(runState, /- Result: completed/);

    const runPlan = await readFile(path.join(root, 'ops/execution/runs', runId, 'plan.md'), 'utf8');
    assert.match(runPlan, /## Selected Tasks\n\n- s001-spec-a/);

    const openItems = await readFile(path.join(root, 'ops/execution/runs', runId, 'open-items.md'), 'utf8');
    assert.match(openItems, /- ID: oi-001/);
    assert.match(openItems, /- Status: resolved/);
    assert.match(openItems, /- Target: ops\/scopes\/features\/f001-feature-a\.md/);

    const campaign = await readFile(path.join(root, 'ops/execution/campaigns/c001-campaign-a/plan.md'), 'utf8');
    assert.match(campaign, /- Linked Feature: f001-feature-a/);
    assert.match(campaign, /- Linked Roadmap: r001-roadmap-a/);
    assert.match(campaign, /- Linked Spec: s001-spec-a/);

    const queue = await readFile(path.join(root, 'ops/execution/campaigns/c001-campaign-a/queue.md'), 'utf8');
    assert.match(queue, new RegExp(`\\| 1 \\| c001-campaign-a \\| s001-spec-a \\| completed \\| ${runId} \\|`));

    const campaignState = await readFile(path.join(root, 'ops/execution/campaigns/c001-campaign-a/state.md'), 'utf8');
    assert.match(campaignState, /- Result: completed/);

    assert.equal(existsSync(path.join(root, 'product/ideal/i001-core.md')), true);
    assert.equal(existsSync(path.join(root, 'reference/notes/planning-note.md')), true);
    const referenceIndex = await readFile(path.join(root, 'reference/INDEX.md'), 'utf8');
    assert.match(referenceIndex, /reference\/notes\/planning-note\.md: Planning note/);

    const reviewId = readdirSync(path.join(root, 'ops/evidence/reviews')).find((name) => name.startsWith('review_'));
    const review = await readFile(path.join(root, 'ops/evidence/reviews', reviewId), 'utf8');
    assert.match(review, /- Reviewer: cc-iasd review command/);
    assert.match(review, /- Base Commit: not-recorded/);
    assert.match(review, /- Review Mode: campaign-completion/);
    assert.doesNotMatch(review, /Reviewer: TBD/);
    assert.doesNotMatch(review, /Base Commit: TBD/);
    assert.doesNotMatch(review, /Review Notes\n\n- TBD/);
    assert.doesNotMatch(review, /Planned Fixes: TBD/);

    runCli(['doctor', root]);
  } finally {
    await cleanup(root);
  }
});

test('profile update refreshes runtime profile files without overwriting by default', async () => {
  const root = await createContext();
  try {
    const output = runCli(['profile', 'update', '--root', root]);
    assert.match(output, /Updated runtime profile/);
    assert.match(output, /Skipped 4 existing file/);

    runCli(['doctor', root]);
  } finally {
    await cleanup(root);
  }
});

test('doctor rejects thin ideal artifacts', async () => {
  const root = await createContext();
  try {
    runCli(['ideal', 'add', 'i001-core', '--summary', 'Core ideal', '--root', root]);
    assert.throws(
      () => runCli(['doctor', root]),
      /Missing ideal Product Ideal content in product\/ideal\/i001-core\.md/,
    );
  } finally {
    await cleanup(root);
  }
});

test('doctor rejects forbidden paths', async () => {
  const root = await createContext();
  try {
    await mkdir(path.join(root, 'ops/logs'), { recursive: true });
    assert.throws(
      () => runCli(['doctor', root]),
      /Forbidden path exists: ops\/logs/,
    );
  } finally {
    await cleanup(root);
  }
});

test('doctor rejects incomplete review evidence', async () => {
  const root = await createContext();
  try {
    await writeFile(path.join(root, 'ops/evidence/reviews/review_20260510000000000_incomplete.md'), [
      '# Review: incomplete',
      '',
      '- Date: 2026-05-10T00:00:00.000Z',
      '- Reviewer: TBD',
      '- Base Commit: TBD',
      '- Scope: Incomplete review',
      '- Scope ID: incomplete',
      '- Review Type: light',
      '- Result: passed',
      '- Trigger: manual',
      '',
      '## Findings',
      '',
      '- None',
      '',
      '## Review Notes',
      '',
      '- TBD',
      '',
      '## Implementation Response Plan',
      '',
      '- Planned Fixes: TBD',
      '- Deferred Items: TBD',
      '',
    ].join('\n'), 'utf8');
    assert.throws(
      () => runCli(['doctor', root]),
      /Missing review reviewer in ops\/evidence\/reviews\/review_20260510000000000_incomplete\.md/,
    );
  } finally {
    await cleanup(root);
  }
});

test('run milestone is not accepted', async () => {
  const root = await createContext();
  try {
    assert.throws(
      () => runCli(['run', 'milestone', 'mvp-001', '--root', root]),
      /Usage: cc-iasd run start <id>/,
    );
  } finally {
    await cleanup(root);
  }
});

test('index evidence is not accepted', async () => {
  const root = await createContext();
  try {
    assert.throws(
      () => runCli(['index', 'evidence', '--root', root]),
      /Unknown command: index/,
    );
  } finally {
    await cleanup(root);
  }
});

test('campaign add rejects unresolved links', async () => {
  const root = await createContext();
  try {
    assert.throws(
      () => runCli(['campaign', 'add', 'c001-campaign-a', '--summary', 'Campaign 1', '--feature', 'f999-missing-feature', '--roadmap', 'missing-roadmap', '--root', root]),
      /Cannot resolve Linked Feature: f999-missing-feature/,
    );
  } finally {
    await cleanup(root);
  }
});

test('run start requires an existing source scope', async () => {
  const root = await createContext();
  try {
    assert.throws(
      () => runCli(['run', 'start', 'missing-source', '--root', root]),
      /Run source does not exist: missing-source/,
    );
  } finally {
    await cleanup(root);
  }
});

test('product outdate and ops archive move artifacts to inactive storage', async () => {
  const root = await createContext();
  try {
    runCli(['ideal', 'add', 'i001-core', '--summary', 'Core ideal', '--root', root]);
    await fillIdeal(root);
    runCli(['spec', 'add', 's001-spec-a', '--summary', 'Spec A', '--root', root]);
    runCli(['roadmap', 'add', 'r001-roadmap-a', '--summary', 'Roadmap A', '--goal', 'Ship A', '--root', root]);

    runCli(['product', 'outdate', 'ideal', 'i001-core', '--dry-run', '--root', root]);
    assert.equal(existsSync(path.join(root, 'product/ideal/i001-core.md')), true);
    assert.equal(existsSync(path.join(root, 'product/ideal/outdated/i001-core.md')), false);

    runCli(['product', 'outdate', 'ideal', 'i001-core', '--root', root]);
    runCli(['product', 'outdate', 'spec', 's001-spec-a', '--root', root]);
    runCli(['ops', 'archive', 'roadmap', 'r001-roadmap-a', '--root', root]);

    assert.equal(existsSync(path.join(root, 'product/ideal/i001-core.md')), false);
    assert.equal(existsSync(path.join(root, 'product/ideal/outdated/i001-core.md')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/s001-spec-a')), false);
    assert.equal(existsSync(path.join(root, 'product/specs/outdated/s001-spec-a/tasks.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/scopes/roadmaps/r001-roadmap-a.md')), false);
    assert.equal(existsSync(path.join(root, 'ops/scopes/roadmaps/archived/r001-roadmap-a.md')), true);

    runCli(['doctor', root]);
  } finally {
    await cleanup(root);
  }
});

test('ops archive supports every ops layer and preserves doctor validity', async () => {
  const root = await createContext();
  try {
    runCli(['feature', 'add', 'f001-feature-a', '--kind', 'epic', '--summary', 'Add feature A', '--pillar', 'Core', '--root', root]);
    runCli(['roadmap', 'add', 'r001-roadmap-a', '--summary', 'Roadmap A', '--goal', 'Ship A', '--root', root]);
    runCli(['spec', 'add', 's001-spec-a', '--summary', 'Spec A', '--root', root]);
    runCli(['campaign', 'add', 'c001-campaign-a', '--summary', 'Campaign 1', '--feature', 'f001-feature-a', '--roadmap', 'r001-roadmap-a', '--spec', 's001-spec-a', '--tasks', 's001-spec-a', '--root', root]);
    const runOutput = runCli(['run', 'start', 'c001-campaign-a', '--root', root]);
    const runId = runOutput.match(/Prepared run (run_[0-9]{17}_c001-campaign-a)/)[1];
    runCli(['review', 'add', runId, '--type', 'light', '--summary', 'Review A', '--result', 'passed', '--root', root]);
    runCli(['report', runId, '--root', root]);

    const reviewId = readdirSync(path.join(root, 'ops/evidence/reviews')).find((name) => name.startsWith('review_'));
    const reportId = readdirSync(path.join(root, 'ops/evidence/reports')).find((name) => name.startsWith('report_'));
    const logId = readdirSync(path.join(root, 'ops/evidence/logs')).find((name) => name.startsWith('log_'));

    runCli(['ops', 'archive', 'campaign', 'c001-campaign-a', '--root', root]);
    runCli(['ops', 'archive', 'run', runId, '--root', root]);
    runCli(['ops', 'archive', 'review', reviewId, '--root', root]);
    runCli(['ops', 'archive', 'report', reportId, '--root', root]);
    runCli(['ops', 'archive', 'log', logId, '--root', root]);
    runCli(['ops', 'archive', 'feature', 'f001-feature-a', '--root', root]);
    runCli(['ops', 'archive', 'roadmap', 'r001-roadmap-a', '--root', root]);

    assert.equal(existsSync(path.join(root, 'ops/scopes/features/archived/f001-feature-a.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/scopes/roadmaps/archived/r001-roadmap-a.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/execution/campaigns/archived/c001-campaign-a/plan.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/execution/runs/archived', runId, 'state.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/evidence/reviews/archived', reviewId)), true);
    assert.equal(existsSync(path.join(root, 'ops/evidence/reports/archived', reportId)), true);
    assert.equal(existsSync(path.join(root, 'ops/evidence/logs/archived', logId)), true);

    runCli(['doctor', root]);
  } finally {
    await cleanup(root);
  }
});

test('ops archive refuses to overwrite an existing destination', async () => {
  const root = await createContext();
  try {
    runCli(['feature', 'add', 'f002-feature-b', '--kind', 'epic', '--summary', 'Add feature B', '--pillar', 'Core', '--root', root]);
    await writeFile(path.join(root, 'ops/scopes/features/archived/f002-feature-b.md'), '# Existing archive\n', 'utf8');
    assert.throws(
      () => runCli(['ops', 'archive', 'feature', 'f002-feature-b', '--root', root]),
      /Destination already exists: ops\/scopes\/features\/archived\/f002-feature-b\.md/,
    );
  } finally {
    await cleanup(root);
  }
});
