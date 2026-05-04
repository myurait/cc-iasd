#!/usr/bin/env node
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const usage = `cc-iasd ${VERSION}

Usage:
  cc-iasd init [project-context-path] [options]
  cc-iasd doctor [project-context-path]
  cc-iasd run milestone <id> [--feature <ref>] [--roadmap <ref>] [--spec <ref>] [--tasks <ref>] [--root <project-context-path>]
  cc-iasd escalate <id> [--root <project-context-path>]
  cc-iasd report <id> [--root <project-context-path>]
  cc-iasd index evidence [--root <project-context-path>]
  cc-iasd log event --summary <text> [--type <type>] [--milestone <id>] [--evidence <path>] [--root <project-context-path>]
  cc-iasd feature add <id> --summary <text> --pillar <name> [--kind epic|supporting] [--root <project-context-path>]
  cc-iasd roadmap add <id> --summary <text> --goal <text> [--root <project-context-path>]
  cc-iasd spec add <id> --summary <text> [--root <project-context-path>]
  cc-iasd --help

Options:
  --doc-lang <language>   Documentation language. Default: Japanese
  --dev-lang <language>   Development language. Default: unspecified
  --product-lang <lang>   Product language. Default: same as --doc-lang
  --root <path>           Project-context root for milestone commands. Default: current directory
  --type <type>           Log event type. Default: manual
  --summary <text>        Log event summary
  --milestone <id>        Related milestone id for log events
  --evidence <path>       Related evidence path for log events
  --feature <ref>         Linked feature for run milestone
  --roadmap <ref>         Linked roadmap for run milestone
  --spec <ref>            Linked spec for run milestone
  --tasks <ref>           Linked tasks for run milestone
  --kind <kind>           Feature kind. Default: epic
  --pillar <name>         Ideal pillar for feature add
  --goal <text>           Goal for roadmap add
  --dry-run               Print planned writes without creating files
  --force                 Overwrite existing files
`;

const parseArgs = (argv) => {
  const parsed = {
    command: 'init',
    target: '.',
    docLang: 'Japanese',
    devLang: '',
    productLang: undefined,
    dryRun: false,
    force: false,
    runTarget: '',
    milestoneId: '',
    eventType: 'manual',
    eventSummary: '',
    relatedMilestone: '',
    relatedEvidence: '',
    linkedFeature: '',
    linkedRoadmap: '',
    linkedSpec: '',
    linkedTasks: '',
    featureId: '',
    featureKind: 'epic',
    idealPillar: '',
    roadmapId: '',
    roadmapGoal: '',
    specId: '',
  };

  const tokens = [...argv];
  if (tokens[0] && !tokens[0].startsWith('-')) {
    parsed.command = tokens.shift();
  }

  if (!['init', 'doctor', 'run', 'escalate', 'report', 'index', 'log', 'feature', 'roadmap', 'spec'].includes(parsed.command)) {
    throw new Error(`Unknown command: ${parsed.command}`);
  }

  if (parsed.command === 'run') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'milestone') {
      throw new Error('Usage: cc-iasd run milestone <id>');
    }
    parsed.milestoneId = tokens.shift() ?? '';
    if (!parsed.milestoneId || parsed.milestoneId.startsWith('-')) {
      throw new Error('Usage: cc-iasd run milestone <id>');
    }
  } else if (parsed.command === 'escalate' || parsed.command === 'report') {
    parsed.milestoneId = tokens.shift() ?? '';
    if (!parsed.milestoneId || parsed.milestoneId.startsWith('-')) {
      throw new Error(`Usage: cc-iasd ${parsed.command} <id>`);
    }
  } else if (parsed.command === 'index') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'evidence') {
      throw new Error('Usage: cc-iasd index evidence');
    }
  } else if (parsed.command === 'log') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'event') {
      throw new Error('Usage: cc-iasd log event --summary <text>');
    }
  } else if (parsed.command === 'feature') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'add') {
      throw new Error('Usage: cc-iasd feature add <id> --summary <text> --pillar <name>');
    }
    parsed.featureId = tokens.shift() ?? '';
    if (!parsed.featureId || parsed.featureId.startsWith('-')) {
      throw new Error('Usage: cc-iasd feature add <id> --summary <text> --pillar <name>');
    }
  } else if (parsed.command === 'roadmap') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'add') {
      throw new Error('Usage: cc-iasd roadmap add <id> --summary <text> --goal <text>');
    }
    parsed.roadmapId = tokens.shift() ?? '';
    if (!parsed.roadmapId || parsed.roadmapId.startsWith('-')) {
      throw new Error('Usage: cc-iasd roadmap add <id> --summary <text> --goal <text>');
    }
  } else if (parsed.command === 'spec') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'add') {
      throw new Error('Usage: cc-iasd spec add <id> --summary <text>');
    }
    parsed.specId = tokens.shift() ?? '';
    if (!parsed.specId || parsed.specId.startsWith('-')) {
      throw new Error('Usage: cc-iasd spec add <id> --summary <text>');
    }
  } else if (tokens[0] && !tokens[0].startsWith('-')) {
    parsed.target = tokens.shift();
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const readValue = (name) => {
      const value = tokens[i + 1];
      if (!value || value.startsWith('-')) {
        throw new Error(`${name} requires a value`);
      }
      i += 1;
      return value;
    };

    switch (token) {
      case '--doc-lang':
        parsed.docLang = readValue(token);
        break;
      case '--dev-lang':
        parsed.devLang = readValue(token);
        break;
      case '--product-lang':
        parsed.productLang = readValue(token);
        break;
      case '--root':
        parsed.target = readValue(token);
        break;
      case '--type':
        parsed.eventType = readValue(token);
        break;
      case '--summary':
        parsed.eventSummary = readValue(token);
        break;
      case '--milestone':
        parsed.relatedMilestone = readValue(token);
        break;
      case '--evidence':
        parsed.relatedEvidence = readValue(token);
        break;
      case '--feature':
        parsed.linkedFeature = readValue(token);
        break;
      case '--roadmap':
        parsed.linkedRoadmap = readValue(token);
        break;
      case '--spec':
        parsed.linkedSpec = readValue(token);
        break;
      case '--tasks':
        parsed.linkedTasks = readValue(token);
        break;
      case '--kind':
        parsed.featureKind = readValue(token);
        break;
      case '--pillar':
        parsed.idealPillar = readValue(token);
        break;
      case '--goal':
        parsed.roadmapGoal = readValue(token);
        break;
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '--force':
        parsed.force = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
  }

  return parsed;
};

const exists = async (target) => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

const assertInside = (target, root) => {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside project-context: ${resolvedTarget}`);
  }
  return resolvedTarget;
};

const render = (content, variables) => {
  let out = content;
  for (const [key, value] of Object.entries(variables)) {
    out = out.replaceAll(`{{${key}}}`, String(value));
  }
  return out;
};

const writeText = async (root, relPath, content, options, created) => {
  const target = assertInside(path.join(root, relPath), root);
  if (!options.force && await exists(target)) {
    created.skipped.push(relPath);
    return;
  }
  created.written.push(relPath);
  if (options.dryRun) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
};

const copyTree = async (root, sourceDir, destDir, options, created, variables) => {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(sourceDir, entry.name);
    const destRel = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(root, source, destRel, options, created, variables);
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith('.pyc')) continue;

    const target = assertInside(path.join(root, destRel), root);
    if (!options.force && await exists(target)) {
      created.skipped.push(destRel);
      continue;
    }
    created.written.push(destRel);
    if (options.dryRun) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
};

const copyTopLevelFiles = async (root, sourceDir, destDir, options, created) => {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const source = path.join(sourceDir, entry.name);
    const destRel = path.join(destDir, entry.name);
    const target = assertInside(path.join(root, destRel), root);
    if (!options.force && await exists(target)) {
      created.skipped.push(destRel);
      continue;
    }
    created.written.push(destRel);
    if (options.dryRun) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
  }
};

const requiredPaths = [
  'runtime/cc-iasd.yaml',
  'runtime/lock.json',
  'rules/policies',
  'rules/roles',
  'rules/templates',
  'rules/project-policies.md',
  'user/product-intent.md',
  'user/constraints.md',
  'user/decisions.md',
  'user/preferences.md',
  'user/scratch.md',
  'ops/ideal/ideal-experience.md',
  'ops/ideal/product-charter.md',
  'ops/features/index.md',
  'ops/features/backlog.md',
  'ops/features/epics',
  'ops/features/supporting',
  'ops/roadmaps',
  'ops/specs',
  'ops/milestones',
  'ops/milestones/project-context/reviews',
  'ops/logs',
  'ops/decisions.md',
  'ops/evidence-index.md',
  'ops/knowledge.md',
  'src',
];

const forbiddenPaths = [
  '.ledger',
  'development-docs',
  'ops/reviews',
];

const forbiddenContent = [
  '.ledger',
  'development-docs',
  'ledger.py',
  'ledger.yaml',
  'ops/reviews/',
];

const extractProjectRefs = (content) => {
  const refs = new Set();
  const matches = content.matchAll(/ops\/[A-Za-z0-9._~/-]+/g);
  for (const match of matches) {
    refs.add(match[0].replace(/[),.;:]+$/, ''));
  }
  return [...refs].sort();
};

const extractRelatedEvidenceRefs = (content) => {
  const refs = [];
  const matches = content.matchAll(/^- Related Evidence:\s*(ops\/\S+)$/gm);
  for (const match of matches) {
    refs.push(match[1].replace(/[),.;:]+$/, ''));
  }
  return refs;
};

const collectMarkdownFiles = async (root, current = '') => {
  const dir = path.join(root, current);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      files.push(...await collectMarkdownFiles(root, rel));
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.yaml') || entry.name.endsWith('.json'))) {
      files.push(rel);
    }
  }
  return files;
};

const doctor = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const issues = [];

  for (const relPath of requiredPaths) {
    if (!await exists(path.join(root, relPath))) {
      issues.push(`Missing required path: ${relPath}`);
    }
  }

  for (const relPath of forbiddenPaths) {
    if (await exists(path.join(root, relPath))) {
      issues.push(`Forbidden legacy path exists: ${relPath}`);
    }
  }

  if (await exists(root)) {
    const files = await collectMarkdownFiles(root);
    for (const file of files) {
      const content = await readFile(path.join(root, file), 'utf8');
      for (const marker of forbiddenContent) {
        if (content.includes(marker)) {
          issues.push(`Forbidden legacy reference "${marker}" in ${file}`);
        }
      }
    }

    const evidenceIndex = path.join(root, 'ops/evidence-index.md');
    if (await exists(evidenceIndex)) {
      const content = await readFile(evidenceIndex, 'utf8');
      for (const ref of extractProjectRefs(content)) {
        if (!await exists(path.join(root, ref))) {
          issues.push(`Broken evidence index reference: ${ref}`);
        }
      }
    }

    const logFiles = await listMarkdownFiles(root, 'ops/logs');
    for (const logFile of logFiles) {
      const basename = path.basename(logFile);
      if (!/^log_[0-9]{17}_[a-z0-9-]+\.md$/.test(basename)) {
        issues.push(`Invalid log file name: ${logFile}`);
      }
      const content = await readFile(path.join(root, logFile), 'utf8');
      for (const ref of extractRelatedEvidenceRefs(content)) {
        if (!await exists(path.join(root, ref))) {
          issues.push(`Broken log evidence reference in ${logFile}: ${ref}`);
        }
      }
    }

    await validateMilestoneLinks(root, issues);
    await validateFeatureFiles(root, issues);
    await validateRoadmapFiles(root, issues);
  } else {
    issues.push(`Project-context path does not exist: ${root}`);
  }

  return { root, issues };
};

const readOptionalText = async (root, relPath) => {
  const target = assertInside(path.join(root, relPath), root);
  try {
    return await readFile(target, 'utf8');
  } catch {
    return '';
  }
};

const listMarkdownFiles = async (root, relDir) => {
  const dir = assertInside(path.join(root, relDir), root);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
      .map((entry) => path.join(relDir, entry.name))
      .sort();
  } catch {
    return [];
  }
};

const listDirectories = async (root, relDir) => {
  const dir = assertInside(path.join(root, relDir), root);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(relDir, entry.name))
      .sort();
  } catch {
    return [];
  }
};

const extractField = (content, label) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^- ${escaped}:\\s*(.+)$`, 'm'));
  if (!match) return '';
  const value = match[1].trim();
  return value === 'TBD' ? '' : value;
};

const isUnset = (value) => !value || value === 'none' || value.startsWith('UNRESOLVED');

const resolveExistingPath = async (root, candidates) => {
  for (const candidate of candidates.filter(Boolean)) {
    if (await exists(path.join(root, candidate))) {
      return candidate;
    }
  }
  return '';
};

const linkedPathCandidates = (kind, value, linkedSpec = '') => {
  if (isUnset(value)) return [];
  if (value.startsWith('ops/')) return [value];

  switch (kind) {
    case 'feature':
      return [
        `ops/features/${value}.md`,
        `ops/features/${value}/README.md`,
        `ops/features/epics/${value}.md`,
        `ops/features/epics/${value}/README.md`,
        `ops/features/supporting/${value}.md`,
        `ops/features/supporting/${value}/README.md`,
      ];
    case 'roadmap':
      return [
        `ops/roadmaps/${value}.md`,
        `ops/roadmaps/${value}/README.md`,
      ];
    case 'spec':
      return [
        `ops/specs/${value}`,
        `ops/specs/${value}/requirements.md`,
      ];
    case 'tasks':
      return [
        `ops/specs/${value}/tasks.md`,
        linkedSpec && !linkedSpec.startsWith('ops/') ? `ops/specs/${linkedSpec}/tasks.md` : '',
        linkedSpec && linkedSpec.startsWith('ops/') ? `${linkedSpec.replace(/\/$/, '')}/tasks.md` : '',
      ];
    default:
      return [];
  }
};

const validateMilestoneLinks = async (root, issues) => {
  const milestoneDirs = await listDirectories(root, 'ops/milestones');
  for (const milestoneDir of milestoneDirs) {
    const statusPath = `${milestoneDir}/status.md`;
    if (!await exists(path.join(root, statusPath))) continue;

    const status = await readFile(path.join(root, statusPath), 'utf8');
    const linkedFeature = extractField(status, 'Linked Feature');
    const linkedRoadmap = extractField(status, 'Linked Roadmap');
    const linkedSpec = extractField(status, 'Linked Spec');
    const linkedTasks = extractField(status, 'Linked Tasks');
    const checks = [
      ['feature', 'Linked Feature', linkedFeature, ''],
      ['roadmap', 'Linked Roadmap', linkedRoadmap, ''],
      ['spec', 'Linked Spec', linkedSpec, ''],
      ['tasks', 'Linked Tasks', linkedTasks, linkedSpec],
    ];

    for (const [kind, label, value, context] of checks) {
      if (isUnset(value)) continue;
      const resolved = await resolveExistingPath(root, linkedPathCandidates(kind, value, context));
      if (!resolved) {
        issues.push(`Broken milestone link in ${statusPath}: ${label} ${value}`);
      }
    }
  }
};

const validateFeatureFiles = async (root, issues) => {
  const featureDirs = [
    ['ops/features/epics', 'epic'],
    ['ops/features/supporting', 'supporting'],
  ];

  for (const [featureDir, expectedKind] of featureDirs) {
    const files = await listMarkdownFiles(root, featureDir);
    for (const file of files) {
      const basename = path.basename(file);
      if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(basename)) {
        issues.push(`Invalid feature file name: ${file}`);
      }

      const content = await readFile(path.join(root, file), 'utf8');
      const kind = extractField(content, 'Kind');
      const summary = extractField(content, 'Summary');
      const idealPillar = extractField(content, 'Ideal Pillar');

      if (kind !== expectedKind) {
        issues.push(`Invalid feature kind in ${file}: ${kind || 'missing'}`);
      }
      if (isUnset(summary)) {
        issues.push(`Missing feature summary in ${file}`);
      }
      if (isUnset(idealPillar)) {
        issues.push(`Missing feature ideal pillar in ${file}`);
      }
    }
  }
};

const validateRoadmapFiles = async (root, issues) => {
  const files = await listMarkdownFiles(root, 'ops/roadmaps');
  for (const file of files) {
    const basename = path.basename(file);
    if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(basename)) {
      issues.push(`Invalid roadmap file name: ${file}`);
    }

    const content = await readFile(path.join(root, file), 'utf8');
    const summary = extractField(content, 'Summary');
    const goal = extractField(content, 'Goal');
    const status = extractField(content, 'Status');

    if (isUnset(summary)) {
      issues.push(`Missing roadmap summary in ${file}`);
    }
    if (isUnset(goal)) {
      issues.push(`Missing roadmap goal in ${file}`);
    }
    if (isUnset(status)) {
      issues.push(`Missing roadmap status in ${file}`);
    }
  }
};

const linkStatus = (label, value) => value || `UNRESOLVED (${label} not set)`;

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'event';

const timestampForFile = (value) => value.replace(/[^0-9]/g, '');

const featureIndexTemplate = () => [
  '# Feature Index',
  '',
  'This file maps ideal pillars to epics and supporting features.',
  '',
  '## Ideal Pillar Mapping',
  '',
  '- Pillar: TBD',
  '- Linked Epics: TBD',
  '- Linked Supporting Features: TBD',
  '- Current Roadmap Coverage: TBD',
  '',
  '## Active Epics',
  '',
  '- TBD',
  '',
  '## Supporting Features',
  '',
  '- TBD',
  '',
  '## Maintenance Notes',
  '',
  '- Keep detailed backlog items in `ops/features/backlog.md`.',
  '- Keep roadmap sequencing in `ops/roadmaps/`.',
  '',
].join('\n');

const featureBacklogTemplate = () => [
  '# Feature Backlog',
  '',
  'Deferred requests, debt, and future feature candidates outside the active roadmap.',
  '',
  '## Item Format',
  '',
  '- ID: backlog-000',
  '- Type: feature / debt / request',
  '- Summary: TBD',
  '- Priority: low / medium / high',
  '- Experience Tie: TBD',
  '- Impact Scope: TBD',
  '- Blockers: none / TBD',
  '- Design Constraints: TBD',
  '- Target Destination: epic / supporting / roadmap / deferred',
  '',
  '## Backlog Items',
  '',
  '- None',
  '',
].join('\n');

const featureFileTemplate = ({ featureId, featureKind, summary, idealPillar, now }) => [
  `# Feature: ${featureId}`,
  '',
  `- ID: ${featureId}`,
  `- Kind: ${featureKind}`,
  `- Summary: ${summary}`,
  `- Ideal Pillar: ${idealPillar}`,
  '- Status: proposed',
  `- Created At: ${now}`,
  '',
  '## Scope',
  '',
  '- Included: TBD',
  '- Excluded: TBD',
  '',
  '## Roadmap Notes',
  '',
  '- TBD',
  '',
].join('\n');

const roadmapFileTemplate = ({ roadmapId, summary, goal, now }) => [
  `# Roadmap: ${roadmapId}`,
  '',
  `- ID: ${roadmapId}`,
  `- Summary: ${summary}`,
  `- Goal: ${goal}`,
  '- Status: proposed',
  `- Created At: ${now}`,
  '',
  '## Milestones',
  '',
  '- TBD',
  '',
  '## Feature Inputs',
  '',
  '- TBD',
  '',
  '## Deferred',
  '',
  '- TBD',
  '',
].join('\n');

const specRequirementsTemplate = ({ specId, summary, now }) => [
  `# Requirements: ${specId}`,
  '',
  `- ID: ${specId}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '',
  '## User Value',
  '',
  '- TBD',
  '',
  '## Requirements',
  '',
  '- TBD',
  '',
].join('\n');

const specPlanTemplate = ({ specId, summary, now }) => [
  `# Plan: ${specId}`,
  '',
  `- ID: ${specId}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '',
  '## Approach',
  '',
  '- TBD',
  '',
  '## Dependencies',
  '',
  '- TBD',
  '',
].join('\n');

const specTasksTemplate = ({ specId, summary, now }) => [
  `# Tasks: ${specId}`,
  '',
  `- ID: ${specId}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '',
  '## Tasks',
  '',
  '- [ ] TBD',
  '',
].join('\n');

const milestoneStatusTemplate = ({ milestoneId, now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => [
  `# Milestone Status: ${milestoneId}`,
  '',
  `- Milestone ID: ${milestoneId}`,
  '- Current Status: ready-for-handoff',
  `- Linked Feature: ${linkedFeature || 'TBD'}`,
  `- Linked Roadmap: ${linkedRoadmap || 'TBD'}`,
  `- Linked Spec: ${linkedSpec || 'TBD'}`,
  `- Linked Tasks: ${linkedTasks || 'TBD'}`,
  '- Active Blocker: none recorded',
  `- Last Update: ${now}`,
  '',
  '## Scope',
  '',
  '- Included: TBD',
  '- Excluded: TBD',
  '',
  '## Current Decision State',
  '',
  '- Human Decisions Required: none recorded',
  '- Autonomous Proceed Status: TBD',
  '',
].join('\n');

const milestoneEvidenceTemplate = ({ milestoneId, now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => [
  `# Milestone Evidence: ${milestoneId}`,
  '',
  '## Run Start',
  '',
  `- Started At: ${now}`,
  `- Linked Feature: ${linkStatus('Linked Feature', linkedFeature)}`,
  `- Linked Roadmap: ${linkStatus('Linked Roadmap', linkedRoadmap)}`,
  `- Linked Spec: ${linkStatus('Linked Spec', linkedSpec)}`,
  `- Linked Tasks: ${linkStatus('Linked Tasks', linkedTasks)}`,
  '',
  '## Execution Evidence',
  '',
  '- Implementation Result: TBD',
  '- Changed Files: TBD',
  '- Commands Run: TBD',
  '- Test / Lint / Build Result: TBD',
  '',
  '## Review Evidence',
  '',
  '- Review Directory: `reviews/`',
  '- Review Result: TBD',
  '',
  '## Remaining Risk',
  '',
  '- TBD',
  '',
].join('\n');

const milestoneHandoffTemplate = ({ milestoneId, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => [
  `# Implementation Handoff: ${milestoneId}`,
  '',
  '## Scope',
  '',
  `Milestone: ${milestoneId}`,
  '',
  '## Source Root',
  '',
  'src/',
  '',
  '## Linked Planning Artifacts',
  '',
  `- Feature: ${linkStatus('Linked Feature', linkedFeature)}`,
  `- Roadmap: ${linkStatus('Linked Roadmap', linkedRoadmap)}`,
  `- Spec: ${linkStatus('Linked Spec', linkedSpec)}`,
  `- Tasks: ${linkStatus('Linked Tasks', linkedTasks)}`,
  '',
  '## Constraints',
  '',
  '- Do not change roadmap, feature scope, or milestone purpose without human approval.',
  '- Keep implementation changes inside `src/` unless the milestone explicitly requires project-context changes.',
  '',
  '## Expected Output',
  '',
  '- Code or project artifact changes',
  '- Test / lint / build results',
  '- Evidence summary for `evidence.md`',
  '',
  '## Evidence To Record',
  '',
  '- Changed files',
  '- Commands run',
  '- Review result',
  '- Remaining risks',
  '',
].join('\n');

const completionReportTemplate = ({ milestoneId, now, status, evidence, reviewFiles }) => [
  `# Completion Report: ${milestoneId}`,
  '',
  `- Milestone ID: ${milestoneId}`,
  `- Generated At: ${now}`,
  '',
  '## Status Summary',
  '',
  status.trim() || 'No status.md content found.',
  '',
  '## Evidence Summary',
  '',
  evidence.trim() || 'No evidence.md content found.',
  '',
  '## Review Evidence',
  '',
  ...(reviewFiles.length ? reviewFiles.map((file) => `- ${file}`) : ['- No review files found.']),
  '',
  '## Completion Assessment',
  '',
  '- Implemented Scope: TBD',
  '- Test / Lint / Build Result: TBD',
  '- Minor Autonomous Decisions: TBD',
  '- Remaining Risks: TBD',
  '- Human Confirmation Points: TBD',
  '',
].join('\n');

const escalationTemplate = ({ milestoneId, now, status, evidence, activeBlocker, linkedSpec, linkedTasks }) => [
  `# Escalation Packet: ${milestoneId}`,
  '',
  `- Milestone ID: ${milestoneId}`,
  `- Generated At: ${now}`,
  `- Active Blocker: ${activeBlocker || 'TBD'}`,
  `- Linked Spec: ${linkedSpec || 'TBD'}`,
  `- Linked Tasks: ${linkedTasks || 'TBD'}`,
  '',
  '## Stop Reason',
  '',
  activeBlocker || 'TBD',
  '',
  '## Current State',
  '',
  status.trim() || 'No status.md content found.',
  '',
  '## Evidence So Far',
  '',
  evidence.trim() || 'No evidence.md content found.',
  '',
  '## Human Decision Required',
  '',
  '- Decision: TBD',
  '- Decision Owner: user',
  '- Needed By: TBD',
  '',
  '## Options',
  '',
  '- Option A: TBD',
  '- Option B: TBD',
  '- Option C: TBD',
  '',
  '## Recommended Option',
  '',
  '- Recommendation: TBD',
  '- Reason: TBD',
  '',
  '## Impact',
  '',
  '- If accepted: TBD',
  '- If rejected: TBD',
  '- If deferred: TBD',
  '',
  '## Resume Conditions',
  '',
  '- TBD',
  '',
].join('\n');

const evidenceIndexTemplate = ({ now, entries }) => [
  '# Evidence Index',
  '',
  `- Generated At: ${now}`,
  '',
  '## Milestone Evidence',
  '',
  ...(entries.length ? entries.flatMap((entry) => [
    `### ${entry.milestoneId}`,
    '',
    `- Status: ${entry.status || 'missing'}`,
    `- Evidence: ${entry.evidence || 'missing'}`,
    `- Escalation: ${entry.escalation || 'missing'}`,
    `- Completion Report: ${entry.completionReport || 'missing'}`,
    '- Reviews:',
    ...(entry.reviews.length ? entry.reviews.map((review) => `  - ${review}`) : ['  - none']),
    '',
  ]) : ['- No milestone evidence found.', '']),
].join('\n');

const logEventTemplate = ({ now, eventType, summary, relatedMilestone, relatedEvidence }) => [
  '# Log Event',
  '',
  `- Date: ${now}`,
  `- Type: ${eventType}`,
  `- Summary: ${summary}`,
  `- Related Milestone: ${relatedMilestone || 'none'}`,
  `- Related Evidence: ${relatedEvidence || 'none'}`,
  '',
  '## Notes',
  '',
  '- TBD',
  '',
].join('\n');

const writeLogEvent = async (root, { eventType, summary, relatedMilestone = '', relatedEvidence = '' }) => {
  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const relPath = `ops/logs/log_${timestampForFile(now)}_${slugify(eventType)}.md`;
  await writeText(root, relPath, logEventTemplate({
    now,
    eventType,
    summary,
    relatedMilestone,
    relatedEvidence,
  }), { force: false, dryRun: false }, created);
  return { root, written: created.written, skipped: created.skipped };
};

const logEvent = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for logging.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd log event --summary <text>');
  }
  return writeLogEvent(root, {
    eventType: args.eventType,
    summary: args.eventSummary,
    relatedMilestone: args.relatedMilestone,
    relatedEvidence: args.relatedEvidence,
  });
};

const addFeature = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for feature add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  if (!['epic', 'supporting'].includes(args.featureKind)) {
    throw new Error('Feature kind must be epic or supporting');
  }
  if (slugify(args.featureId) !== args.featureId) {
    throw new Error('Feature id must be lowercase kebab-case ASCII');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd feature add <id> --summary <text> --pillar <name>');
  }
  if (!args.idealPillar) {
    throw new Error('Usage: cc-iasd feature add <id> --summary <text> --pillar <name>');
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const relPath = `ops/features/${args.featureKind === 'epic' ? 'epics' : 'supporting'}/${args.featureId}.md`;
  await writeText(root, relPath, featureFileTemplate({
    featureId: args.featureId,
    featureKind: args.featureKind,
    summary: args.eventSummary,
    idealPillar: args.idealPillar,
    now,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'feature-add',
    summary: `Added ${args.featureKind} feature ${args.featureId}`,
    relatedEvidence: relPath,
  });

  return { root, featureId: args.featureId, featurePath: relPath, written: created.written, skipped: created.skipped };
};

const addRoadmap = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for roadmap add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  if (slugify(args.roadmapId) !== args.roadmapId) {
    throw new Error('Roadmap id must be lowercase kebab-case ASCII');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd roadmap add <id> --summary <text> --goal <text>');
  }
  if (!args.roadmapGoal) {
    throw new Error('Usage: cc-iasd roadmap add <id> --summary <text> --goal <text>');
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const relPath = `ops/roadmaps/${args.roadmapId}.md`;
  await writeText(root, relPath, roadmapFileTemplate({
    roadmapId: args.roadmapId,
    summary: args.eventSummary,
    goal: args.roadmapGoal,
    now,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'roadmap-add',
    summary: `Added roadmap ${args.roadmapId}`,
    relatedEvidence: relPath,
  });

  return { root, roadmapId: args.roadmapId, roadmapPath: relPath, written: created.written, skipped: created.skipped };
};

const addSpec = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for spec add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  if (slugify(args.specId) !== args.specId) {
    throw new Error('Spec id must be lowercase kebab-case ASCII');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd spec add <id> --summary <text>');
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const specRoot = `ops/specs/${args.specId}`;
  await writeText(root, `${specRoot}/requirements.md`, specRequirementsTemplate({
    specId: args.specId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);
  await writeText(root, `${specRoot}/plan.md`, specPlanTemplate({
    specId: args.specId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);
  await writeText(root, `${specRoot}/tasks.md`, specTasksTemplate({
    specId: args.specId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'spec-add',
    summary: `Added spec ${args.specId}`,
    relatedEvidence: `${specRoot}/tasks.md`,
  });

  return { root, specId: args.specId, specRoot, written: created.written, skipped: created.skipped };
};

const indexEvidence = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for evidence indexing.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const milestoneDirs = await listDirectories(root, 'ops/milestones');
  const entries = [];
  for (const milestoneDir of milestoneDirs) {
    const milestoneId = path.basename(milestoneDir);
    const status = `${milestoneDir}/status.md`;
    const evidence = `${milestoneDir}/evidence.md`;
    const escalation = `${milestoneDir}/escalation.md`;
    const completionReport = `${milestoneDir}/completion-report.md`;
    const reviews = await listMarkdownFiles(root, `${milestoneDir}/reviews`);
    const hasStatus = await exists(path.join(root, status));
    const hasEvidence = await exists(path.join(root, evidence));
    const hasEscalation = await exists(path.join(root, escalation));
    const hasCompletionReport = await exists(path.join(root, completionReport));
    if (!hasStatus && !hasEvidence && !hasEscalation && !hasCompletionReport && !reviews.length) {
      continue;
    }
    entries.push({
      milestoneId,
      status: hasStatus ? status : '',
      evidence: hasEvidence ? evidence : '',
      escalation: hasEscalation ? escalation : '',
      completionReport: hasCompletionReport ? completionReport : '',
      reviews,
    });
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  await writeText(root, 'ops/evidence-index.md', evidenceIndexTemplate({ now, entries }), { ...args, force: true }, created);
  await writeLogEvent(root, {
    eventType: 'index-evidence',
    summary: `Rebuilt evidence index with ${entries.length} milestone(s)`,
    relatedEvidence: 'ops/evidence-index.md',
  });
  return { root, written: created.written, entries };
};

const runMilestone = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for milestone run.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const milestoneId = args.milestoneId;
  const milestoneRoot = `ops/milestones/${milestoneId}`;
  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const existingStatus = await readOptionalText(root, `${milestoneRoot}/status.md`);
  const linkedFeature = args.linkedFeature || extractField(existingStatus, 'Linked Feature');
  const linkedRoadmap = args.linkedRoadmap || extractField(existingStatus, 'Linked Roadmap');
  const linkedSpec = args.linkedSpec || extractField(existingStatus, 'Linked Spec');
  const linkedTasks = args.linkedTasks || extractField(existingStatus, 'Linked Tasks');

  await writeText(root, `${milestoneRoot}/status.md`, milestoneStatusTemplate({ milestoneId, now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${milestoneRoot}/evidence.md`, milestoneEvidenceTemplate({ milestoneId, now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${milestoneRoot}/handoff.md`, milestoneHandoffTemplate({ milestoneId, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${milestoneRoot}/reviews/README.md`, [
    `# Reviews: ${milestoneId}`,
    '',
    'Review evidence for this milestone.',
    '',
  ].join('\n'), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'run',
    summary: `Prepared milestone handoff for ${milestoneId}`,
    relatedMilestone: milestoneId,
    relatedEvidence: `${milestoneRoot}/evidence.md`,
  });

  return { root, milestoneId, written: created.written, skipped: created.skipped };
};

const reportMilestone = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for milestone report.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const milestoneId = args.milestoneId;
  const milestoneRoot = `ops/milestones/${milestoneId}`;
  if (!await exists(path.join(root, milestoneRoot))) {
    throw new Error(`Milestone does not exist: ${milestoneRoot}`);
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const status = await readOptionalText(root, `${milestoneRoot}/status.md`);
  const evidence = await readOptionalText(root, `${milestoneRoot}/evidence.md`);
  const reviewFiles = await listMarkdownFiles(root, `${milestoneRoot}/reviews`);

  await writeText(root, `${milestoneRoot}/completion-report.md`, completionReportTemplate({
    milestoneId,
    now,
    status,
    evidence,
    reviewFiles,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'report',
    summary: `Prepared completion report for ${milestoneId}`,
    relatedMilestone: milestoneId,
    relatedEvidence: `${milestoneRoot}/completion-report.md`,
  });

  return { root, milestoneId, written: created.written, skipped: created.skipped };
};

const escalateMilestone = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for escalation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const milestoneId = args.milestoneId;
  const milestoneRoot = `ops/milestones/${milestoneId}`;
  if (!await exists(path.join(root, milestoneRoot))) {
    throw new Error(`Milestone does not exist: ${milestoneRoot}`);
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const status = await readOptionalText(root, `${milestoneRoot}/status.md`);
  const evidence = await readOptionalText(root, `${milestoneRoot}/evidence.md`);
  const activeBlocker = extractField(status, 'Active Blocker');
  const linkedSpec = extractField(status, 'Linked Spec');
  const linkedTasks = extractField(status, 'Linked Tasks');

  await writeText(root, `${milestoneRoot}/escalation.md`, escalationTemplate({
    milestoneId,
    now,
    status,
    evidence,
    activeBlocker,
    linkedSpec,
    linkedTasks,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'escalate',
    summary: `Prepared escalation packet for ${milestoneId}`,
    relatedMilestone: milestoneId,
    relatedEvidence: `${milestoneRoot}/escalation.md`,
  });

  return { root, milestoneId, written: created.written, skipped: created.skipped };
};

const init = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const created = { written: [], skipped: [] };
  const now = new Date().toISOString();
  const variables = {
    documentationLanguage: args.docLang,
    developmentLanguage: args.devLang,
    codeInternalLanguage: 'English',
    productLanguages: args.productLang ?? args.docLang,
    setupDate: now,
    version: VERSION,
  };

  if (!args.dryRun) {
    await mkdir(root, { recursive: true });
  }

  await writeText(root, 'runtime/cc-iasd.yaml', [
    `version: ${VERSION}`,
    `created_at: ${now}`,
    'src_root: src',
    'rules_root: rules',
    'user_root: user',
    'ops_root: ops',
    'specs_root: ops/specs',
    '',
  ].join('\n'), args, created);

  await writeText(root, 'runtime/lock.json', `${JSON.stringify({
    cc_iasd_version: VERSION,
    created_at: now,
    spec_kernel: 'spec-kit-compatible',
    implementation_plugin: 'cc-sdd-or-compatible',
    src_root: 'src',
    profile: 'default',
  }, null, 2)}\n`, args, created);

  await copyTree(root, path.join(packageRoot, 'rules'), 'rules/policies', args, created, variables);
  await copyTree(root, path.join(packageRoot, 'roles'), 'rules/roles', args, created, variables);
  await copyTopLevelFiles(root, path.join(packageRoot, 'templates'), 'rules/templates', args, created);

  await writeText(root, 'rules/project-policies.md', [
    '# Project Policies',
    '',
    'This file is the canonical source for project-specific policy settings.',
    '',
    '## Language Policy',
    '',
    `- Documentation Language: ${args.docLang}`,
    `- Development Language: ${args.devLang}`,
    '- Code-Internal Language: English',
    `- Product Languages: ${args.productLang ?? args.docLang}`,
    '',
  ].join('\n'), args, created);

  await writeText(root, 'user/product-intent.md', '# Product Intent\n', args, created);
  await writeText(root, 'user/constraints.md', '# Constraints\n', args, created);
  await writeText(root, 'user/decisions.md', '# User Decisions\n', args, created);
  await writeText(root, 'user/preferences.md', '# Preferences\n', args, created);
  await writeText(root, 'user/scratch.md', '# Scratch\n', args, created);

  await writeText(root, 'ops/ideal/ideal-experience.md', '# Ideal Experience\n', args, created);
  await writeText(root, 'ops/ideal/product-charter.md', '# Product Charter\n', args, created);
  await writeText(root, 'ops/features/index.md', featureIndexTemplate(), args, created);
  await writeText(root, 'ops/features/backlog.md', featureBacklogTemplate(), args, created);
  await writeText(root, 'ops/features/epics/README.md', [
    '# Epics',
    '',
    'Large feature areas linked to ideal pillars.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/features/supporting/README.md', [
    '# Supporting Features',
    '',
    'Concrete feature candidates or blockers that support roadmap execution.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/roadmaps/README.md', '# Roadmaps\n', args, created);
  await writeText(root, 'ops/specs/README.md', '# Specs\n', args, created);
  await writeText(root, 'ops/milestones/README.md', [
    '# Milestones',
    '',
    'Milestones contain status, evidence, planning packages, reviews, escalations, and completion reports.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/milestones/project-context/reviews/README.md', [
    '# Project Context Reviews',
    '',
    'Reviews that are not tied to a product milestone, such as project-context initialization, rules changes, runtime adapter changes, or repository-wide audits.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/logs/README.md', [
    '# Logs',
    '',
    'Global chronological work ledger for project-context operations that may span milestones.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/decisions.md', '# Ops Decisions\n', args, created);
  await writeText(root, 'ops/evidence-index.md', '# Evidence Index\n', args, created);
  await writeText(root, 'ops/knowledge.md', '# Ops Knowledge\n', args, created);
  await writeText(root, 'src/README.md', '# Source Project\n', args, created);

  await writeText(root, 'AGENTS.md', [
    '# AGENTS.md',
    '',
    'This project-context uses cc-iasd.',
    '',
    '## Project Roots',
    '',
    '- `rules/`: stable constraints, roles, templates, and checklists',
    '- `user/`: human-authored intent, constraints, decisions, and preferences',
    '- `ops/`: ideal, features, roadmaps, specs, milestones, logs, evidence, and reports',
    '- `runtime/`: cc-iasd runtime configuration and generated adapters',
    '- `src/`: source project root',
    '',
    '## Required Reading',
    '',
    '- `rules/policies/AI_RUNTIME_RULES.md`',
    '- `rules/project-policies.md`',
    '',
  ].join('\n'), args, created);

  return created;
};

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (args.command === 'doctor') {
    const result = await doctor(args);
    if (result.issues.length) {
      console.error(`cc-iasd doctor failed for ${result.root}`);
      for (const issue of result.issues) {
        console.error(`- ${issue}`);
      }
      process.exit(1);
    }
    console.log(`cc-iasd doctor passed for ${result.root}`);
  } else if (args.command === 'run') {
    const result = await runMilestone(args);
    console.log(`Prepared milestone ${result.milestoneId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Use --force only with init; run does not overwrite milestone records.`);
    }
  } else if (args.command === 'escalate') {
    const result = await escalateMilestone(args);
    console.log(`Prepared escalation packet for milestone ${result.milestoneId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Escalate does not overwrite milestone records.`);
    }
  } else if (args.command === 'report') {
    const result = await reportMilestone(args);
    console.log(`Prepared completion report for milestone ${result.milestoneId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Report does not overwrite milestone records.`);
    }
  } else if (args.command === 'index') {
    const result = await indexEvidence(args);
    console.log(`Rebuilt evidence index in ${result.root}.`);
    console.log(`Indexed ${result.entries.length} milestone(s).`);
  } else if (args.command === 'log') {
    const result = await logEvent(args);
    console.log(`Created ${result.written.length} log file(s) in ${result.root}.`);
  } else if (args.command === 'feature') {
    const result = await addFeature(args);
    console.log(`Prepared feature ${result.featureId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Feature add does not overwrite feature records.`);
    }
  } else if (args.command === 'roadmap') {
    const result = await addRoadmap(args);
    console.log(`Prepared roadmap ${result.roadmapId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Roadmap add does not overwrite roadmap records.`);
    }
  } else if (args.command === 'spec') {
    const result = await addSpec(args);
    console.log(`Prepared spec ${result.specId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Spec add does not overwrite spec records.`);
    }
  } else {
    const result = await init(args);
    console.log(`${args.dryRun ? 'Planned' : 'Created'} ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Use --force to overwrite.`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error(usage);
  process.exit(1);
}
