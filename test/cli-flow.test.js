import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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

    const view = runCli(['index', 'evidence', '--root', root]);
    assert.match(view, /# Evidence View/);
    assert.match(view, /ops\/scopes\/milestones\/mvp-001\.md/);
    assert.match(view, /ops\/evidence\/reviews\/review_/);
    assert.equal(existsSync(path.join(root, 'ops/evidence-index.md')), false);

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
