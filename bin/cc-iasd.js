#!/usr/bin/env node
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const usage = `cc-iasd ${VERSION}

Usage:
  cc-iasd init [project-context-path] [options]
  cc-iasd doctor [project-context-path]
  cc-iasd run cycle <id> [--root <project-context-path>]
  cc-iasd escalate <scope-id> [--root <project-context-path>]
  cc-iasd report <scope-id> [--root <project-context-path>]
  cc-iasd view evidence [--root <project-context-path>]
  cc-iasd view current [--root <project-context-path>]
  cc-iasd view scope <id> [--root <project-context-path>]
  cc-iasd view cycle <id> [--root <project-context-path>]
  cc-iasd log event --summary <text> [--type <type>] [--milestone <id>] [--evidence <path>] [--root <project-context-path>]
  cc-iasd review add <scope-id> --summary <text> --result <text> [--type light|full] [--root <project-context-path>]
  cc-iasd feature add <id> --summary <text> --pillar <name> [--kind epic|supporting] [--root <project-context-path>]
  cc-iasd roadmap add <id> --summary <text> --goal <text> [--root <project-context-path>]
  cc-iasd milestone add <id> --summary <text> [--feature <ref>] [--roadmap <ref>] [--spec <ref>] [--tasks <ref>] [--root <project-context-path>]
  cc-iasd spec add <id> --summary <text> [--root <project-context-path>]
  cc-iasd product outdate ideal <id> [--root <project-context-path>]
  cc-iasd product outdate spec <id> [--root <project-context-path>]
  cc-iasd ops archive feature|roadmap|milestone|cycle|log|review|report <id> [--root <project-context-path>]
  cc-iasd --help

Options:
  --doc-lang <language>   Documentation language. Default: Japanese
  --dev-lang <language>   Development language. Default: unspecified
  --product-lang <lang>   Product language. Default: same as --doc-lang
  --root <path>           Project-context root for milestone commands. Default: current directory
  --type <type>           Log event type, or review type for review add
  --summary <text>        Log event or review summary
  --result <text>         Review result summary
  --milestone <id>        Related milestone id for log events
  --evidence <path>       Related evidence path for log events
  --feature <ref>         Linked feature for milestone add
  --roadmap <ref>         Linked roadmap for milestone add
  --spec <ref>            Linked spec for milestone add
  --tasks <ref>           Linked tasks for milestone add
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
    reviewResult: '',
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
    productLayer: '',
    productId: '',
    archiveLayer: '',
    archiveId: '',
    viewId: '',
  };

  const tokens = [...argv];
  if (tokens[0] && !tokens[0].startsWith('-')) {
    parsed.command = tokens.shift();
  }

  if (!['init', 'doctor', 'run', 'escalate', 'report', 'view', 'log', 'review', 'feature', 'roadmap', 'milestone', 'spec', 'product', 'ops'].includes(parsed.command)) {
    throw new Error(`Unknown command: ${parsed.command}`);
  }

  if (parsed.command === 'run') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'cycle') {
      throw new Error('Usage: cc-iasd run cycle <id>');
    }
    parsed.milestoneId = tokens.shift() ?? '';
    if (!parsed.milestoneId || parsed.milestoneId.startsWith('-')) {
      throw new Error('Usage: cc-iasd run cycle <id>');
    }
  } else if (parsed.command === 'escalate' || parsed.command === 'report') {
    parsed.milestoneId = tokens.shift() ?? '';
    if (!parsed.milestoneId || parsed.milestoneId.startsWith('-')) {
      throw new Error(`Usage: cc-iasd ${parsed.command} <id>`);
    }
  } else if (parsed.command === 'view') {
    parsed.runTarget = tokens.shift() ?? '';
    if (!['evidence', 'current', 'scope', 'cycle'].includes(parsed.runTarget)) {
      throw new Error('Usage: cc-iasd view evidence|current|scope|cycle');
    }
    if (parsed.runTarget === 'scope' || parsed.runTarget === 'cycle') {
      parsed.viewId = tokens.shift() ?? '';
      if (!parsed.viewId || parsed.viewId.startsWith('-')) {
        throw new Error(`Usage: cc-iasd view ${parsed.runTarget} <id>`);
      }
    }
  } else if (parsed.command === 'log') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'event') {
      throw new Error('Usage: cc-iasd log event --summary <text>');
    }
  } else if (parsed.command === 'review') {
    parsed.eventType = 'light';
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'add') {
      throw new Error('Usage: cc-iasd review add <scope-id> --summary <text> --result <text>');
    }
    parsed.milestoneId = tokens.shift() ?? '';
    if (!parsed.milestoneId || parsed.milestoneId.startsWith('-')) {
      throw new Error('Usage: cc-iasd review add <scope-id> --summary <text> --result <text>');
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
  } else if (parsed.command === 'milestone') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'add') {
      throw new Error('Usage: cc-iasd milestone add <id> --summary <text>');
    }
    parsed.milestoneId = tokens.shift() ?? '';
    if (!parsed.milestoneId || parsed.milestoneId.startsWith('-')) {
      throw new Error('Usage: cc-iasd milestone add <id> --summary <text>');
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
  } else if (parsed.command === 'product') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'outdate') {
      throw new Error('Usage: cc-iasd product outdate ideal|spec <id>');
    }
    parsed.productLayer = tokens.shift() ?? '';
    parsed.productId = tokens.shift() ?? '';
    if (!['ideal', 'spec'].includes(parsed.productLayer) || !parsed.productId || parsed.productId.startsWith('-')) {
      throw new Error('Usage: cc-iasd product outdate ideal|spec <id>');
    }
  } else if (parsed.command === 'ops') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'archive') {
      throw new Error('Usage: cc-iasd ops archive feature|roadmap|milestone|cycle|log|review|report <id>');
    }
    parsed.archiveLayer = tokens.shift() ?? '';
    parsed.archiveId = tokens.shift() ?? '';
    if (!['feature', 'roadmap', 'milestone', 'cycle', 'log', 'review', 'report'].includes(parsed.archiveLayer) || !parsed.archiveId || parsed.archiveId.startsWith('-')) {
      throw new Error('Usage: cc-iasd ops archive feature|roadmap|milestone|cycle|log|review|report <id>');
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
      case '--result':
        parsed.reviewResult = readValue(token);
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

const movePath = async (root, sourceRel, destRel, options) => {
  const source = assertInside(path.join(root, sourceRel), root);
  const dest = assertInside(path.join(root, destRel), root);
  if (!await exists(source)) {
    throw new Error(`Source does not exist: ${sourceRel}`);
  }
  if (await exists(dest)) {
    throw new Error(`Destination already exists: ${destRel}`);
  }
  if (!options.dryRun) {
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(source, dest);
  }
  return { source: sourceRel, destination: destRel };
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
  'product/ideal',
  'product/ideal/outdated',
  'product/specs',
  'product/specs/outdated',
  'ops/scopes/features',
  'ops/scopes/features/archived',
  'ops/scopes/roadmaps',
  'ops/scopes/roadmaps/archived',
  'ops/scopes/milestones',
  'ops/scopes/milestones/archived',
  'ops/cycles',
  'ops/cycles/archived',
  'ops/evidence/logs',
  'ops/evidence/logs/archived',
  'ops/evidence/reviews',
  'ops/evidence/reviews/archived',
  'ops/evidence/reports',
  'ops/evidence/reports/archived',
  'reference/INDEX.md',
  'src',
];

const forbiddenPaths = [
  '.ledger',
  'development-docs',
  'ops/ideal',
  'ops/specs',
  'ops/features',
  'ops/roadmaps',
  'ops/milestones/project-context/reviews',
  'ops/logs',
  'ops/reviews',
  'ops/decisions.md',
  'ops/evidence-index.md',
  'ops/knowledge.md',
];

const forbiddenContent = [
  '.ledger',
  'development-docs',
  'ledger.py',
  'ledger.yaml',
  'ops/ideal/',
  'ops/specs/',
  'ops/features/',
  'ops/roadmaps/',
  'ops/milestones/project-context/reviews',
  'ops/logs/',
  'ops/reviews/',
  'ops/decisions.md',
  'ops/evidence-index.md',
  'ops/knowledge.md',
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

const archivedEvidenceCandidates = (ref) => {
  const archiveRules = [
    ['ops/scopes/features/', 'ops/scopes/features/archived/'],
    ['ops/scopes/roadmaps/', 'ops/scopes/roadmaps/archived/'],
    ['ops/scopes/milestones/', 'ops/scopes/milestones/archived/'],
    ['ops/cycles/', 'ops/cycles/archived/'],
    ['ops/evidence/logs/', 'ops/evidence/logs/archived/'],
    ['ops/evidence/reviews/', 'ops/evidence/reviews/archived/'],
    ['ops/evidence/reports/', 'ops/evidence/reports/archived/'],
  ];
  const candidates = [ref];
  for (const [prefix, archivedPrefix] of archiveRules) {
    if (ref.startsWith(prefix) && !ref.startsWith(archivedPrefix)) {
      candidates.push(`${archivedPrefix}${ref.slice(prefix.length)}`);
      break;
    }
  }
  return candidates;
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

    const logFiles = await listMarkdownFiles(root, 'ops/evidence/logs');
    for (const logFile of logFiles) {
      const basename = path.basename(logFile);
      if (!/^log_[0-9]{17}_[a-z0-9-]+\.md$/.test(basename)) {
        issues.push(`Invalid log file name: ${logFile}`);
      }
      const content = await readFile(path.join(root, logFile), 'utf8');
      for (const ref of extractRelatedEvidenceRefs(content)) {
        const resolved = await resolveExistingPath(root, archivedEvidenceCandidates(ref));
        if (!resolved) {
          issues.push(`Broken log evidence reference in ${logFile}: ${ref}`);
        }
      }
    }

    await validateMilestoneLinks(root, issues);
    await validateFeatureFiles(root, issues);
    await validateRoadmapFiles(root, issues);
    await validateSpecFiles(root, issues);
    await validateReviewFiles(root, issues);
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
  if (value.startsWith('ops/') || value.startsWith('product/')) return [value];

  switch (kind) {
    case 'feature':
      return [
        `ops/scopes/features/${value}.md`,
      ];
    case 'roadmap':
      return [
        `ops/scopes/roadmaps/${value}.md`,
      ];
    case 'spec':
      return [
        `product/specs/${value}`,
        `product/specs/${value}/requirements.md`,
      ];
    case 'tasks':
      return [
        `product/specs/${value}/tasks.md`,
        linkedSpec && !linkedSpec.startsWith('ops/') && !linkedSpec.startsWith('product/') ? `product/specs/${linkedSpec}/tasks.md` : '',
        linkedSpec && (linkedSpec.startsWith('ops/') || linkedSpec.startsWith('product/')) ? `${linkedSpec.replace(/\/$/, '')}/tasks.md` : '',
      ];
    default:
      return [];
  }
};

const validateMilestoneLinks = async (root, issues) => {
  const milestoneFiles = await listMarkdownFiles(root, 'ops/scopes/milestones');
  for (const milestoneFile of milestoneFiles) {
    const content = await readFile(path.join(root, milestoneFile), 'utf8');
    const linkedFeature = extractField(content, 'Linked Feature');
    const linkedRoadmap = extractField(content, 'Linked Roadmap');
    const linkedSpec = extractField(content, 'Linked Spec');
    const linkedTasks = extractField(content, 'Linked Tasks');
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
        issues.push(`Broken milestone link in ${milestoneFile}: ${label} ${value}`);
      }
    }
  }
};

const validateFeatureFiles = async (root, issues) => {
  const files = await listMarkdownFiles(root, 'ops/scopes/features');
  for (const file of files) {
    const basename = path.basename(file);
    if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(basename)) {
      issues.push(`Invalid feature file name: ${file}`);
    }

    const content = await readFile(path.join(root, file), 'utf8');
    const summary = extractField(content, 'Summary');
    const idealPillar = extractField(content, 'Ideal Pillar');

    if (isUnset(summary)) {
      issues.push(`Missing feature summary in ${file}`);
    }
    if (isUnset(idealPillar)) {
      issues.push(`Missing feature ideal pillar in ${file}`);
    }
  }
};

const validateRoadmapFiles = async (root, issues) => {
  const files = await listMarkdownFiles(root, 'ops/scopes/roadmaps');
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

const validateSpecFiles = async (root, issues) => {
  const specDirs = await listDirectories(root, 'product/specs');
  for (const specDir of specDirs) {
    if (path.basename(specDir) === 'outdated') continue;
    const basename = path.basename(specDir);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(basename)) {
      issues.push(`Invalid spec directory name: ${specDir}`);
    }

    const requiredSpecFiles = [
      'requirements.md',
      'plan.md',
      'tasks.md',
    ];

    for (const fileName of requiredSpecFiles) {
      const relPath = `${specDir}/${fileName}`;
      if (!await exists(path.join(root, relPath))) {
        issues.push(`Missing spec file: ${relPath}`);
      }
    }

    const tasksPath = `${specDir}/tasks.md`;
    if (await exists(path.join(root, tasksPath))) {
      const tasks = await readFile(path.join(root, tasksPath), 'utf8');
      if (!/^- \[[ xX]\] .+/m.test(tasks)) {
        issues.push(`Missing spec task checklist in ${tasksPath}`);
      }
    }
  }
};

const validateReviewFiles = async (root, issues) => {
  const reviewFiles = await listMarkdownFiles(root, 'ops/evidence/reviews');
  for (const file of reviewFiles) {
    const basename = path.basename(file);
    if (!/^review_[0-9]{17}_[a-z0-9-]+\.md$/.test(basename)) {
      issues.push(`Invalid review file name: ${file}`);
    }

    const content = await readFile(path.join(root, file), 'utf8');
    const reviewType = extractField(content, 'Review Type');
    const result = extractField(content, 'Result');

    if (!['light', 'full'].includes(reviewType)) {
      issues.push(`Invalid review type in ${file}: ${reviewType || 'missing'}`);
    }
    if (isUnset(result)) {
      issues.push(`Missing review result in ${file}`);
    }
  }
};

const linkStatus = (label, value) => value || `UNRESOLVED (${label} not set)`;

const slugify = (value) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'event';

const timestampForFile = (value) => value.replace(/[^0-9]/g, '');

const assertArchiveId = (id) => {
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('Archive id must not include path separators or special characters');
  }
};

const markdownId = (id) => id.endsWith('.md') ? id : `${id}.md`;

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
  '- Keep feature scopes in `ops/scopes/features/`.',
  '- Keep roadmap scopes in `ops/scopes/roadmaps/`.',
  '',
].join('\n');

const featureBacklogTemplate = () => [
  '# Feature Backlog',
  '',
  'Planning backlog for feature-scoped work candidates that have not yet been cut into roadmap, spec, milestone, or task artifacts.',
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
  '- Source: user / planning / promoted-open-item / review',
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
  '## Backlog',
  '',
  '- None',
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

const milestoneScopeTemplate = ({ milestoneId, summary = 'TBD', now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => [
  `# Milestone: ${milestoneId}`,
  '',
  `- Milestone ID: ${milestoneId}`,
  `- Summary: ${summary}`,
  '- Status: ready-for-cycle',
  `- Linked Feature: ${linkedFeature || 'TBD'}`,
  `- Linked Roadmap: ${linkedRoadmap || 'TBD'}`,
  `- Linked Spec: ${linkedSpec || 'TBD'}`,
  `- Linked Tasks: ${linkedTasks || 'TBD'}`,
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

const cycleStateTemplate = ({ cycleId, milestoneId, now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => [
  `# Cycle State: ${cycleId}`,
  '',
  `- Cycle ID: ${cycleId}`,
  `- Milestone ID: ${milestoneId}`,
  '- Result: in-progress',
  '- Active Blocker: none recorded',
  `- Started At: ${now}`,
  `- Last Update: ${now}`,
  '',
  '## Scope Links',
  '',
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
  '- Review References: TBD',
  '- Review Result: TBD',
  '',
  '## Open Items',
  '',
  '- None',
  '',
  '## Open Item Resolution',
  '',
  '- Resolved: none',
  '- Escalated: none',
  '- Promoted To Feature Backlog: none',
  '- Deferred: none',
  '',
  '## Remaining Risk',
  '',
  '- TBD',
  '',
].join('\n');

const cycleHandoffTemplate = ({ cycleId, milestoneId, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => [
  `# Cycle Handoff: ${cycleId}`,
  '',
  '## Scope',
  '',
  `Cycle: ${cycleId}`,
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
  '- Evidence summary for `state.md`',
  '',
  '## Evidence To Record',
  '',
  '- Changed files',
  '- Commands run',
  '- Review result',
  '- Remaining risks',
  '',
].join('\n');

const cycleKnowledgeTemplate = ({ cycleId, milestoneId, now }) => [
  `# Cycle Knowledge: ${cycleId}`,
  '',
  `- Cycle ID: ${cycleId}`,
  `- Milestone ID: ${milestoneId}`,
  `- Created At: ${now}`,
  '',
  '## Local Lessons',
  '',
  '- None recorded.',
  '',
  '## Promotion Candidates',
  '',
  '- None recorded.',
  '',
].join('\n');

const completionReportTemplate = ({ scopeId, now, milestoneScope, cycleStates, reviewFiles }) => [
  `# Completion Report: ${scopeId}`,
  '',
  `- Scope ID: ${scopeId}`,
  `- Generated At: ${now}`,
  '',
  '## Milestone Scope Summary',
  '',
  milestoneScope.trim() || 'No milestone scope content found.',
  '',
  '## Cycle State Summary',
  '',
  ...(cycleStates.length ? cycleStates.flatMap((entry) => [
    `### ${entry.path}`,
    '',
    entry.content.trim() || 'No state.md content found.',
    '',
  ]) : ['No cycle state files found.', '']),
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

const reviewRecordTemplate = ({ scopeId, now, reviewType, summary, result }) => [
  `# Review: ${scopeId}`,
  '',
  `- Date: ${now}`,
  '- Reviewer: TBD',
  '- Base Commit: TBD',
  `- Scope: ${summary}`,
  `- Scope ID: ${scopeId}`,
  `- Review Type: ${reviewType}`,
  `- Result: ${result}`,
  '- Trigger: manual',
  '',
  '## Findings',
  '',
  '### Critical',
  '',
  '- None',
  '',
  '### High',
  '',
  '- None',
  '',
  '### Medium',
  '',
  '- None',
  '',
  '### Low',
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
].join('\n');

const escalationTemplate = ({ scopeId, now, milestoneScope, cycleStates, activeBlocker, linkedSpec, linkedTasks }) => [
  `# Escalation Packet: ${scopeId}`,
  '',
  `- Scope ID: ${scopeId}`,
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
  milestoneScope.trim() || 'No milestone scope content found.',
  '',
  '## Evidence So Far',
  '',
  ...(cycleStates.length ? cycleStates.flatMap((entry) => [
    `### ${entry.path}`,
    '',
    entry.content.trim() || 'No state.md content found.',
    '',
  ]) : ['No cycle state files found.', '']),
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

const evidenceViewTemplate = ({ now, entries }) => [
  '# Evidence View',
  '',
  `- Generated At: ${now}`,
  '',
  '## Evidence Artifacts',
  '',
  ...(entries.length ? entries.flatMap((entry) => [
    `### ${entry.scopeId}`,
    '',
    `- Milestone: ${entry.milestone || 'missing'}`,
    '- Cycles:',
    ...(entry.cycles.length ? entry.cycles.map((cycle) => `  - ${cycle}`) : ['  - none']),
    '- Reports:',
    ...(entry.reports.length ? entry.reports.map((report) => `  - ${report}`) : ['  - none']),
    '- Reviews:',
    ...(entry.reviews.length ? entry.reviews.map((review) => `  - ${review}`) : ['  - none']),
    '',
  ]) : ['- No evidence artifacts found.', '']),
].join('\n');

const currentViewTemplate = ({ now, ideals, specs, features, roadmaps, milestones, cycles, logs, reviews, reports }) => [
  '# Current View',
  '',
  `- Generated At: ${now}`,
  '',
  '## Product Canon',
  '',
  '- Ideal:',
  ...(ideals.length ? ideals.map((item) => `  - ${item}`) : ['  - none']),
  '- Specs:',
  ...(specs.length ? specs.map((item) => `  - ${item}`) : ['  - none']),
  '',
  '## Scope Artifacts',
  '',
  '- Features:',
  ...(features.length ? features.map((item) => `  - ${item}`) : ['  - none']),
  '- Roadmaps:',
  ...(roadmaps.length ? roadmaps.map((item) => `  - ${item}`) : ['  - none']),
  '- Milestones:',
  ...(milestones.length ? milestones.map((item) => `  - ${item}`) : ['  - none']),
  '',
  '## Runtime And Evidence',
  '',
  '- Cycles:',
  ...(cycles.length ? cycles.map((item) => `  - ${item}`) : ['  - none']),
  '- Recent Logs:',
  ...(logs.length ? logs.map((item) => `  - ${item}`) : ['  - none']),
  '- Recent Reviews:',
  ...(reviews.length ? reviews.map((item) => `  - ${item}`) : ['  - none']),
  '- Recent Reports:',
  ...(reports.length ? reports.map((item) => `  - ${item}`) : ['  - none']),
  '',
].join('\n');

const contentSection = (title, relPath, content) => [
  `## ${title}`,
  '',
  `Path: ${relPath}`,
  '',
  '```markdown',
  content.trim(),
  '```',
  '',
];

const scopeViewTemplate = ({ now, scopeId, sections, relatedCycles, relatedReviews, relatedReports }) => [
  `# Scope View: ${scopeId}`,
  '',
  `- Generated At: ${now}`,
  '',
  ...(sections.length ? sections.flatMap((section) => contentSection(section.title, section.path, section.content)) : ['## Scope Artifacts', '', '- No matching scope artifacts found.', '']),
  '## Related Evidence',
  '',
  '- Cycles:',
  ...(relatedCycles.length ? relatedCycles.map((item) => `  - ${item}`) : ['  - none']),
  '- Reviews:',
  ...(relatedReviews.length ? relatedReviews.map((item) => `  - ${item}`) : ['  - none']),
  '- Reports:',
  ...(relatedReports.length ? relatedReports.map((item) => `  - ${item}`) : ['  - none']),
  '',
].join('\n');

const cycleViewTemplate = ({ now, cycleId, sections }) => [
  `# Cycle View: ${cycleId}`,
  '',
  `- Generated At: ${now}`,
  '',
  ...(sections.length ? sections.flatMap((section) => contentSection(section.title, section.path, section.content)) : ['- No matching cycle artifact found.', '']),
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

const listCycleStateEntries = async (root, scopeId) => {
  const cycleDirs = await listDirectories(root, 'ops/cycles');
  const entries = [];
  for (const cycleDir of cycleDirs) {
    const statePath = `${cycleDir}/state.md`;
    const content = await readOptionalText(root, statePath);
    if (!content) continue;
    if (extractField(content, 'Milestone ID') !== scopeId && !path.basename(cycleDir).endsWith(`_${scopeId}`)) {
      continue;
    }
    entries.push({ path: statePath, content });
  }
  return entries;
};

const listReviewFilesForScope = async (root, scopeId) => {
  const reviewFiles = await listMarkdownFiles(root, 'ops/evidence/reviews');
  const matches = [];
  for (const reviewFile of reviewFiles) {
    const content = await readOptionalText(root, reviewFile);
    if (extractField(content, 'Scope ID') === scopeId) {
      matches.push(reviewFile);
    }
  }
  return matches;
};

const listReportFilesForScope = async (root, scopeId) => {
  const reportFiles = await listMarkdownFiles(root, 'ops/evidence/reports');
  const matches = [];
  for (const reportFile of reportFiles) {
    const content = await readOptionalText(root, reportFile);
    if (extractField(content, 'Scope ID') === scopeId || path.basename(reportFile).includes(`_${scopeId}.md`)) {
      matches.push(reportFile);
    }
  }
  return matches;
};

const readExistingSections = async (root, entries) => {
  const sections = [];
  for (const [title, relPath] of entries) {
    if (!await exists(path.join(root, relPath))) continue;
    sections.push({
      title,
      path: relPath,
      content: await readFile(path.join(root, relPath), 'utf8'),
    });
  }
  return sections;
};

const latest = (items, count) => [...items].sort().slice(-count);

const validateLinkedArgs = async (root, { linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => {
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
      throw new Error(`Cannot resolve ${label}: ${value}`);
    }
  }
};

const writeLogEvent = async (root, { eventType, summary, relatedMilestone = '', relatedEvidence = '' }) => {
  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const relPath = `ops/evidence/logs/log_${timestampForFile(now)}_${slugify(eventType)}.md`;
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
  const relPath = `ops/scopes/features/${args.featureId}.md`;
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
  const relPath = `ops/scopes/roadmaps/${args.roadmapId}.md`;
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
  const specRoot = `product/specs/${args.specId}`;
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

const addMilestone = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for milestone add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  const milestoneId = args.milestoneId;
  if (slugify(milestoneId) !== milestoneId) {
    throw new Error('Milestone id must be lowercase kebab-case ASCII');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd milestone add <id> --summary <text>');
  }
  await validateLinkedArgs(root, args);

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const milestonePath = `ops/scopes/milestones/${milestoneId}.md`;
  await writeText(root, milestonePath, milestoneScopeTemplate({
    milestoneId,
    summary: args.eventSummary,
    now,
    linkedFeature: args.linkedFeature,
    linkedRoadmap: args.linkedRoadmap,
    linkedSpec: args.linkedSpec,
    linkedTasks: args.linkedTasks,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'milestone-add',
    summary: `Added milestone ${milestoneId}`,
    relatedMilestone: milestoneId,
    relatedEvidence: milestonePath,
  });

  return { root, milestoneId, milestonePath, written: created.written, skipped: created.skipped };
};

const addReview = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for review add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  if (!['light', 'full'].includes(args.eventType)) {
    throw new Error('Review type must be light or full');
  }
  if (!args.eventSummary || !args.reviewResult) {
    throw new Error('Usage: cc-iasd review add <scope-id> --summary <text> --result <text>');
  }

  const scopeId = args.milestoneId;
  if (slugify(scopeId) !== scopeId) {
    throw new Error('Scope id must be lowercase kebab-case ASCII');
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const reviewPath = `ops/evidence/reviews/review_${timestampForFile(now)}_${slugify(args.eventSummary)}.md`;
  await writeText(root, reviewPath, reviewRecordTemplate({
    scopeId,
    now,
    reviewType: args.eventType,
    summary: args.eventSummary,
    result: args.reviewResult,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'review-add',
    summary: `Added ${args.eventType} review for ${scopeId}`,
    relatedMilestone: scopeId,
    relatedEvidence: reviewPath,
  });

  return { root, scopeId, reviewPath, written: created.written, skipped: created.skipped };
};

const viewEvidence = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for evidence view generation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const milestoneFiles = await listMarkdownFiles(root, 'ops/scopes/milestones');
  const entries = [];
  for (const milestone of milestoneFiles) {
    const scopeId = path.basename(milestone, '.md');
    const cycles = (await listCycleStateEntries(root, scopeId)).map((entry) => entry.path);
    const reviews = await listReviewFilesForScope(root, scopeId);
    const reports = await listReportFilesForScope(root, scopeId);
    entries.push({
      scopeId,
      milestone,
      cycles,
      reports,
      reviews,
    });
  }

  const now = new Date().toISOString();
  return { root, entries, view: evidenceViewTemplate({ now, entries }) };
};

const viewCurrent = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for current view generation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const ideals = await listMarkdownFiles(root, 'product/ideal');
  const specs = (await listDirectories(root, 'product/specs')).filter((item) => path.basename(item) !== 'outdated');
  const features = await listMarkdownFiles(root, 'ops/scopes/features');
  const roadmaps = await listMarkdownFiles(root, 'ops/scopes/roadmaps');
  const milestones = await listMarkdownFiles(root, 'ops/scopes/milestones');
  const cycles = (await listDirectories(root, 'ops/cycles')).filter((item) => path.basename(item) !== 'archived');
  const logs = latest(await listMarkdownFiles(root, 'ops/evidence/logs'), 5);
  const reviews = latest(await listMarkdownFiles(root, 'ops/evidence/reviews'), 5);
  const reports = latest(await listMarkdownFiles(root, 'ops/evidence/reports'), 5);
  const now = new Date().toISOString();
  return { root, view: currentViewTemplate({ now, ideals, specs, features, roadmaps, milestones, cycles, logs, reviews, reports }) };
};

const viewScope = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for scope view generation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  assertArchiveId(args.viewId);
  const scopeId = args.viewId;
  const sections = await readExistingSections(root, [
    ['Feature Scope', `ops/scopes/features/${scopeId}.md`],
    ['Roadmap Scope', `ops/scopes/roadmaps/${scopeId}.md`],
    ['Milestone Scope', `ops/scopes/milestones/${scopeId}.md`],
    ['Spec Requirements', `product/specs/${scopeId}/requirements.md`],
    ['Spec Plan', `product/specs/${scopeId}/plan.md`],
    ['Spec Tasks', `product/specs/${scopeId}/tasks.md`],
  ]);
  const relatedCycles = (await listCycleStateEntries(root, scopeId)).map((entry) => entry.path);
  const relatedReviews = await listReviewFilesForScope(root, scopeId);
  const relatedReports = await listReportFilesForScope(root, scopeId);
  const now = new Date().toISOString();
  return { root, view: scopeViewTemplate({ now, scopeId, sections, relatedCycles, relatedReviews, relatedReports }) };
};

const viewCycle = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for cycle view generation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  assertArchiveId(args.viewId);
  const cycleId = args.viewId;
  const cycleRoot = `ops/cycles/${cycleId}`;
  const sections = await readExistingSections(root, [
    ['State', `${cycleRoot}/state.md`],
    ['Handoff', `${cycleRoot}/handoff.md`],
    ['Knowledge', `${cycleRoot}/knowledge.md`],
  ]);
  const now = new Date().toISOString();
  return { root, view: cycleViewTemplate({ now, cycleId, sections }) };
};

const viewContext = async (args) => {
  if (args.runTarget === 'evidence') return viewEvidence(args);
  if (args.runTarget === 'current') return viewCurrent(args);
  if (args.runTarget === 'scope') return viewScope(args);
  if (args.runTarget === 'cycle') return viewCycle(args);
  throw new Error('Usage: cc-iasd view evidence|current|scope|cycle');
};

const runCycle = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for cycle run.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const milestoneId = args.milestoneId;
  if (slugify(milestoneId) !== milestoneId) {
    throw new Error('Milestone id must be lowercase kebab-case ASCII');
  }
  const milestonePath = `ops/scopes/milestones/${milestoneId}.md`;
  if (!await exists(path.join(root, milestonePath))) {
    throw new Error(`Milestone does not exist: ${milestonePath}`);
  }
  const now = new Date().toISOString();
  const cycleId = `cycle_${timestampForFile(now)}_${milestoneId}`;
  const cycleRoot = `ops/cycles/${cycleId}`;
  const created = { written: [], skipped: [] };
  const existingMilestone = await readOptionalText(root, milestonePath);
  const linkedFeature = args.linkedFeature || extractField(existingMilestone, 'Linked Feature');
  const linkedRoadmap = args.linkedRoadmap || extractField(existingMilestone, 'Linked Roadmap');
  const linkedSpec = args.linkedSpec || extractField(existingMilestone, 'Linked Spec');
  const linkedTasks = args.linkedTasks || extractField(existingMilestone, 'Linked Tasks');

  await writeText(root, `${cycleRoot}/state.md`, cycleStateTemplate({ cycleId, milestoneId, now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${cycleRoot}/handoff.md`, cycleHandoffTemplate({ cycleId, milestoneId, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${cycleRoot}/knowledge.md`, cycleKnowledgeTemplate({ cycleId, milestoneId, now }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'run',
    summary: `Prepared cycle ${cycleId} for milestone ${milestoneId}`,
    relatedMilestone: milestoneId,
    relatedEvidence: `${cycleRoot}/state.md`,
  });

  return { root, milestoneId, cycleId, written: created.written, skipped: created.skipped };
};

const reportMilestone = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for milestone report.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const scopeId = args.milestoneId;
  const milestonePath = `ops/scopes/milestones/${scopeId}.md`;
  if (!await exists(path.join(root, milestonePath))) {
    throw new Error(`Milestone does not exist: ${milestonePath}`);
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const milestoneScope = await readOptionalText(root, milestonePath);
  const cycleStates = await listCycleStateEntries(root, scopeId);
  const reviewFiles = await listReviewFilesForScope(root, scopeId);
  const reportPath = `ops/evidence/reports/report_${timestampForFile(now)}_${scopeId}.md`;

  await writeText(root, reportPath, completionReportTemplate({
    scopeId,
    now,
    milestoneScope,
    cycleStates,
    reviewFiles,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'report',
    summary: `Prepared completion report for ${scopeId}`,
    relatedMilestone: scopeId,
    relatedEvidence: reportPath,
  });

  return { root, scopeId, reportPath, written: created.written, skipped: created.skipped };
};

const escalateMilestone = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for escalation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const scopeId = args.milestoneId;
  const milestonePath = `ops/scopes/milestones/${scopeId}.md`;
  if (!await exists(path.join(root, milestonePath))) {
    throw new Error(`Milestone does not exist: ${milestonePath}`);
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const milestoneScope = await readOptionalText(root, milestonePath);
  const cycleStates = await listCycleStateEntries(root, scopeId);
  const latestCycleState = cycleStates.at(-1)?.content || '';
  const activeBlocker = extractField(latestCycleState, 'Active Blocker');
  const linkedSpec = extractField(milestoneScope, 'Linked Spec') || extractField(latestCycleState, 'Linked Spec');
  const linkedTasks = extractField(milestoneScope, 'Linked Tasks') || extractField(latestCycleState, 'Linked Tasks');
  const reportPath = `ops/evidence/reports/escalation_${timestampForFile(now)}_${scopeId}.md`;

  await writeText(root, reportPath, escalationTemplate({
    scopeId,
    now,
    milestoneScope,
    cycleStates,
    activeBlocker,
    linkedSpec,
    linkedTasks,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'escalate',
    summary: `Prepared escalation packet for ${scopeId}`,
    relatedMilestone: scopeId,
    relatedEvidence: reportPath,
  });

  return { root, scopeId, reportPath, written: created.written, skipped: created.skipped };
};

const outdateProduct = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for product outdate.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  assertArchiveId(args.productId);
  const fileId = markdownId(args.productId);
  const paths = args.productLayer === 'ideal'
    ? {
      source: `product/ideal/${fileId}`,
      destination: `product/ideal/outdated/${fileId}`,
    }
    : {
      source: `product/specs/${args.productId}`,
      destination: `product/specs/outdated/${args.productId}`,
    };

  const moved = await movePath(root, paths.source, paths.destination, args);
  if (!args.dryRun) {
    await writeLogEvent(root, {
      eventType: 'product-outdate',
      summary: `Outdated product ${args.productLayer} ${args.productId}`,
      relatedEvidence: moved.destination,
    });
  }
  return { root, layer: args.productLayer, id: args.productId, ...moved };
};

const archiveOps = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for ops archive.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  assertArchiveId(args.archiveId);
  const fileId = markdownId(args.archiveId);
  const mappings = {
    feature: [`ops/scopes/features/${fileId}`, `ops/scopes/features/archived/${fileId}`],
    roadmap: [`ops/scopes/roadmaps/${fileId}`, `ops/scopes/roadmaps/archived/${fileId}`],
    milestone: [`ops/scopes/milestones/${fileId}`, `ops/scopes/milestones/archived/${fileId}`],
    cycle: [`ops/cycles/${args.archiveId}`, `ops/cycles/archived/${args.archiveId}`],
    log: [`ops/evidence/logs/${fileId}`, `ops/evidence/logs/archived/${fileId}`],
    review: [`ops/evidence/reviews/${fileId}`, `ops/evidence/reviews/archived/${fileId}`],
    report: [`ops/evidence/reports/${fileId}`, `ops/evidence/reports/archived/${fileId}`],
  };
  const [source, destination] = mappings[args.archiveLayer];
  const moved = await movePath(root, source, destination, args);
  if (!args.dryRun) {
    await writeLogEvent(root, {
      eventType: 'ops-archive',
      summary: `Archived ops ${args.archiveLayer} ${args.archiveId}`,
      relatedEvidence: moved.destination,
    });
  }
  return { root, layer: args.archiveLayer, id: args.archiveId, ...moved };
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
    'product_root: product',
    'ops_root: ops',
    'specs_root: product/specs',
    'scopes_root: ops/scopes',
    'cycles_root: ops/cycles',
    'evidence_root: ops/evidence',
    'reference_root: reference',
    '',
  ].join('\n'), args, created);

  await writeText(root, 'runtime/lock.json', `${JSON.stringify({
    cc_iasd_version: VERSION,
    created_at: now,
    spec_kernel: 'spec-kit-compatible',
    implementation_plugin: 'cc-sdd-or-compatible',
    src_root: 'src',
    product_root: 'product',
    specs_root: 'product/specs',
    scopes_root: 'ops/scopes',
    cycles_root: 'ops/cycles',
    evidence_root: 'ops/evidence',
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

  await writeText(root, 'product/ideal/README.md', [
    '# Ideal',
    '',
    'Product canon for normalized ideal artifacts. Files in `outdated/` are no longer current product canon.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'product/ideal/outdated/README.md', [
    '# Outdated Ideal',
    '',
    'Ideal artifacts that no longer hold product canon status.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'product/specs/README.md', [
    '# Specs',
    '',
    'Spec Kit compatible requirements, plan, and tasks live here.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'product/specs/outdated/README.md', [
    '# Outdated Specs',
    '',
    'Spec directories that no longer hold product canon status.',
    '',
  ].join('\n'), args, created);

  await writeText(root, 'ops/scopes/features/README.md', [
    '# Feature Scopes',
    '',
    'Feature scope artifacts. Archived feature scopes move to `archived/`.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/scopes/features/archived/README.md', '# Archived Feature Scopes\n', args, created);
  await writeText(root, 'ops/scopes/roadmaps/README.md', [
    '# Roadmap Scopes',
    '',
    'Roadmap scope artifacts. Archived roadmaps move to `archived/`.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/scopes/roadmaps/archived/README.md', '# Archived Roadmap Scopes\n', args, created);
  await writeText(root, 'ops/scopes/milestones/README.md', [
    '# Milestones',
    '',
    'Milestones are roadmap endpoints or planning boundaries. Execution state lives in `ops/cycles/`.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/scopes/milestones/archived/README.md', '# Archived Milestones\n', args, created);

  await writeText(root, 'ops/cycles/README.md', [
    '# Cycles',
    '',
    'Cycle artifacts track autonomous execution state, handoff, and cycle-local knowledge.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/cycles/archived/README.md', '# Archived Cycles\n', args, created);

  await writeText(root, 'ops/evidence/logs/README.md', [
    '# Logs',
    '',
    'Global chronological work ledger. Archived logs move to `archived/`.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/evidence/logs/archived/README.md', '# Archived Logs\n', args, created);
  await writeText(root, 'ops/evidence/reviews/README.md', [
    '# Reviews',
    '',
    'Scope-crossing review evidence. Product, scope, and cycle artifacts refer to review IDs or paths.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/evidence/reviews/archived/README.md', '# Archived Reviews\n', args, created);
  await writeText(root, 'ops/evidence/reports/README.md', [
    '# Reports',
    '',
    'Human-facing reports such as escalation, completion, and progress reports.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/evidence/reports/archived/README.md', '# Archived Reports\n', args, created);

  await writeText(root, 'reference/INDEX.md', [
    '# Reference',
    '',
    'Non-canonical reference materials, historical documents, external sources, and notes.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'reference/historical-documents/README.md', '# Historical Documents\n', args, created);
  await writeText(root, 'reference/external/README.md', '# External References\n', args, created);
  await writeText(root, 'reference/notes/README.md', '# Reference Notes\n', args, created);
  await writeText(root, 'src/README.md', [
    '# Source Project',
    '',
    'Place the source project under this directory.',
    '',
    'For a single repository, clone the target repository into `src/`, or alias an existing checkout to `src/`.',
    '',
    'For multiple repositories, clone them side by side under `src/`.',
    '',
    '```text',
    'src/',
    '  app-repository/',
    '  api-repository/',
    '  shared-library/',
    '```',
    '',
  ].join('\n'), args, created);

  await writeText(root, 'AGENTS.md', [
    '# AGENTS.md',
    '',
    'This project-context uses cc-iasd.',
    '',
    '## Project Roots',
    '',
    '- `rules/`: stable constraints, roles, templates, and checklists',
    '- `user/`: human-authored intent, constraints, decisions, and preferences',
    '- `product/`: product canon such as ideal and specs',
    '- `ops/`: scopes, cycles, and evidence',
    '- `reference/`: non-canonical reference material',
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
    const result = await runCycle(args);
    console.log(`Prepared cycle ${result.cycleId} for milestone ${result.milestoneId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Run does not overwrite existing cycle records.`);
    }
  } else if (args.command === 'escalate') {
    const result = await escalateMilestone(args);
    console.log(`Prepared escalation packet for scope ${result.scopeId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Escalate does not overwrite report records.`);
    }
  } else if (args.command === 'report') {
    const result = await reportMilestone(args);
    console.log(`Prepared completion report for scope ${result.scopeId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Report does not overwrite report records.`);
    }
  } else if (args.command === 'view') {
    const result = await viewContext(args);
    console.log(result.view);
  } else if (args.command === 'log') {
    const result = await logEvent(args);
    console.log(`Created ${result.written.length} log file(s) in ${result.root}.`);
  } else if (args.command === 'review') {
    const result = await addReview(args);
    console.log(`Prepared ${args.eventType} review for scope ${result.scopeId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Review add does not overwrite review records.`);
    }
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
  } else if (args.command === 'milestone') {
    const result = await addMilestone(args);
    console.log(`Prepared milestone ${result.milestoneId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Milestone add does not overwrite milestone records.`);
    }
  } else if (args.command === 'spec') {
    const result = await addSpec(args);
    console.log(`Prepared spec ${result.specId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Spec add does not overwrite spec records.`);
    }
  } else if (args.command === 'product') {
    const result = await outdateProduct(args);
    console.log(`${args.dryRun ? 'Planned product outdate' : 'Outdated product'} ${result.layer} ${result.id} in ${result.root}.`);
    console.log(`${args.dryRun ? 'Would move' : 'Moved'} ${result.source} -> ${result.destination}.`);
  } else if (args.command === 'ops') {
    const result = await archiveOps(args);
    console.log(`${args.dryRun ? 'Planned ops archive' : 'Archived ops'} ${result.layer} ${result.id} in ${result.root}.`);
    console.log(`${args.dryRun ? 'Would move' : 'Moved'} ${result.source} -> ${result.destination}.`);
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
