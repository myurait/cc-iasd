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

test('init creates the product ops reference structure', async () => {
  const root = await createContext();
  try {
    runCli(['doctor', root]);

    assert.equal(existsSync(path.join(root, 'product/ideal')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/outdated')), true);
    assert.equal(existsSync(path.join(root, 'ops/scopes/milestones/archived')), true);
    assert.equal(existsSync(path.join(root, 'ops/cycles/archived')), true);
    assert.equal(existsSync(path.join(root, 'ops/evidence/reviews/archived')), true);
    assert.equal(existsSync(path.join(root, 'reference/INDEX.md')), true);

    assert.equal(existsSync(path.join(root, 'ops/evidence-index.md')), false);
    assert.equal(existsSync(path.join(root, 'ops/milestones')), false);
    assert.equal(existsSync(path.join(root, 'ops/logs')), false);
  } finally {
    await cleanup(root);
  }
});

test('artifact commands write to the new structure and keep doctor green', async () => {
  const root = await createContext();
  try {
    runCli(['feature', 'add', 'feature-a', '--kind', 'epic', '--summary', 'Add feature A', '--pillar', 'Core', '--root', root]);
    runCli(['roadmap', 'add', 'roadmap-a', '--summary', 'Roadmap A', '--goal', 'Ship A', '--root', root]);
    runCli(['spec', 'add', 'spec-a', '--summary', 'Spec A', '--root', root]);
    runCli(['milestone', 'add', 'mvp-001', '--summary', 'Milestone 1', '--feature', 'feature-a', '--roadmap', 'roadmap-a', '--spec', 'spec-a', '--tasks', 'spec-a', '--root', root]);
    runCli(['run', 'cycle', 'mvp-001', '--root', root]);
    runCli(['review', 'add', 'mvp-001', '--type', 'light', '--summary', 'Review A', '--result', 'passed', '--root', root]);
    runCli(['escalate', 'mvp-001', '--root', root]);
    runCli(['report', 'mvp-001', '--root', root]);

    const evidenceView = runCli(['view', 'evidence', '--root', root]);
    assert.match(evidenceView, /# Evidence View/);
    assert.match(evidenceView, /ops\/scopes\/milestones\/mvp-001\.md/);
    assert.match(evidenceView, /ops\/evidence\/reviews\/review_/);
    assert.equal(existsSync(path.join(root, 'ops/evidence-index.md')), false);

    const currentView = runCli(['view', 'current', '--root', root]);
    assert.match(currentView, /# Current View/);
    assert.match(currentView, /ops\/scopes\/milestones\/mvp-001\.md/);

    const scopeView = runCli(['view', 'scope', 'mvp-001', '--root', root]);
    assert.match(scopeView, /# Scope View: mvp-001/);
    assert.match(scopeView, /## Milestone Scope/);

    const cycleDir = readdirSync(path.join(root, 'ops/cycles')).find((name) => name.startsWith('cycle_'));
    const cycleView = runCli(['view', 'cycle', cycleDir, '--root', root]);
    assert.match(cycleView, new RegExp(`# Cycle View: ${cycleDir}`));
    assert.match(cycleView, /## State/);

    const feature = await readFile(path.join(root, 'ops/scopes/features/feature-a.md'), 'utf8');
    assert.match(feature, /## Backlog/);

    const cycleState = await readFile(path.join(root, 'ops/cycles', cycleDir, 'state.md'), 'utf8');
    assert.match(cycleState, /## Open Items/);
    assert.match(cycleState, /## Open Item Resolution/);

    const milestone = await readFile(path.join(root, 'ops/scopes/milestones/mvp-001.md'), 'utf8');
    assert.match(milestone, /- Linked Feature: feature-a/);
    assert.match(milestone, /- Linked Roadmap: roadmap-a/);
    assert.match(milestone, /- Linked Spec: spec-a/);

    runCli(['doctor', root]);
  } finally {
    await cleanup(root);
  }
});

test('doctor rejects legacy ledger paths', async () => {
  const root = await createContext();
  try {
    await mkdir(path.join(root, 'ops/logs'), { recursive: true });
    assert.throws(
      () => runCli(['doctor', root]),
      /Forbidden legacy path exists: ops\/logs/,
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
      /Usage: cc-iasd run cycle <id>/,
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

test('milestone add rejects unresolved links', async () => {
  const root = await createContext();
  try {
    assert.throws(
      () => runCli(['milestone', 'add', 'mvp-001', '--summary', 'Milestone 1', '--feature', 'missing-feature', '--root', root]),
      /Cannot resolve Linked Feature: missing-feature/,
    );
  } finally {
    await cleanup(root);
  }
});

test('run cycle requires an existing milestone scope', async () => {
  const root = await createContext();
  try {
    assert.throws(
      () => runCli(['run', 'cycle', 'missing-milestone', '--root', root]),
      /Milestone does not exist: ops\/scopes\/milestones\/missing-milestone\.md/,
    );
  } finally {
    await cleanup(root);
  }
});

test('product outdate and ops archive move artifacts to inactive storage', async () => {
  const root = await createContext();
  try {
    await writeFile(path.join(root, 'product/ideal/core.md'), '# Core Ideal\n', 'utf8');
    runCli(['spec', 'add', 'spec-a', '--summary', 'Spec A', '--root', root]);
    runCli(['roadmap', 'add', 'roadmap-a', '--summary', 'Roadmap A', '--goal', 'Ship A', '--root', root]);

    runCli(['product', 'outdate', 'ideal', 'core', '--dry-run', '--root', root]);
    assert.equal(existsSync(path.join(root, 'product/ideal/core.md')), true);
    assert.equal(existsSync(path.join(root, 'product/ideal/outdated/core.md')), false);

    runCli(['product', 'outdate', 'ideal', 'core', '--root', root]);
    runCli(['product', 'outdate', 'spec', 'spec-a', '--root', root]);
    runCli(['ops', 'archive', 'roadmap', 'roadmap-a', '--root', root]);

    assert.equal(existsSync(path.join(root, 'product/ideal/core.md')), false);
    assert.equal(existsSync(path.join(root, 'product/ideal/outdated/core.md')), true);
    assert.equal(existsSync(path.join(root, 'product/specs/spec-a')), false);
    assert.equal(existsSync(path.join(root, 'product/specs/outdated/spec-a/tasks.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/scopes/roadmaps/roadmap-a.md')), false);
    assert.equal(existsSync(path.join(root, 'ops/scopes/roadmaps/archived/roadmap-a.md')), true);

    runCli(['doctor', root]);
  } finally {
    await cleanup(root);
  }
});

test('ops archive supports every ops layer and preserves doctor validity', async () => {
  const root = await createContext();
  try {
    runCli(['feature', 'add', 'feature-a', '--kind', 'epic', '--summary', 'Add feature A', '--pillar', 'Core', '--root', root]);
    runCli(['roadmap', 'add', 'roadmap-a', '--summary', 'Roadmap A', '--goal', 'Ship A', '--root', root]);
    runCli(['spec', 'add', 'spec-a', '--summary', 'Spec A', '--root', root]);
    runCli(['milestone', 'add', 'mvp-001', '--summary', 'Milestone 1', '--feature', 'feature-a', '--roadmap', 'roadmap-a', '--spec', 'spec-a', '--tasks', 'spec-a', '--root', root]);
    runCli(['run', 'cycle', 'mvp-001', '--root', root]);
    runCli(['review', 'add', 'mvp-001', '--type', 'light', '--summary', 'Review A', '--result', 'passed', '--root', root]);
    runCli(['report', 'mvp-001', '--root', root]);

    const cycleId = readdirSync(path.join(root, 'ops/cycles')).find((name) => name.startsWith('cycle_'));
    const reviewId = readdirSync(path.join(root, 'ops/evidence/reviews')).find((name) => name.startsWith('review_'));
    const reportId = readdirSync(path.join(root, 'ops/evidence/reports')).find((name) => name.startsWith('report_'));
    const logId = readdirSync(path.join(root, 'ops/evidence/logs')).find((name) => name.startsWith('log_'));

    runCli(['ops', 'archive', 'milestone', 'mvp-001', '--root', root]);
    runCli(['ops', 'archive', 'cycle', cycleId, '--root', root]);
    runCli(['ops', 'archive', 'review', reviewId, '--root', root]);
    runCli(['ops', 'archive', 'report', reportId, '--root', root]);
    runCli(['ops', 'archive', 'log', logId, '--root', root]);
    runCli(['ops', 'archive', 'feature', 'feature-a', '--root', root]);
    runCli(['ops', 'archive', 'roadmap', 'roadmap-a', '--root', root]);

    assert.equal(existsSync(path.join(root, 'ops/scopes/features/archived/feature-a.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/scopes/roadmaps/archived/roadmap-a.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/scopes/milestones/archived/mvp-001.md')), true);
    assert.equal(existsSync(path.join(root, 'ops/cycles/archived', cycleId, 'state.md')), true);
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
    runCli(['feature', 'add', 'feature-b', '--kind', 'epic', '--summary', 'Add feature B', '--pillar', 'Core', '--root', root]);
    await writeFile(path.join(root, 'ops/scopes/features/archived/feature-b.md'), '# Existing archive\n', 'utf8');
    assert.throws(
      () => runCli(['ops', 'archive', 'feature', 'feature-b', '--root', root]),
      /Destination already exists: ops\/scopes\/features\/archived\/feature-b\.md/,
    );
  } finally {
    await cleanup(root);
  }
});
