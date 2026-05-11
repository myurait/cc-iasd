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
  cc-iasd campaign add <id> --summary <text> --roadmap <ref> [--spec <ref>] [--tasks <ref>] [--root <project-context-path>]
  cc-iasd campaign mark-run <campaign-id> <run-id> --status completed|blocked|escalated|deferred [--root <project-context-path>]
  cc-iasd run start <id> [--root <project-context-path>]
  cc-iasd escalate <scope-id> [--root <project-context-path>]
  cc-iasd report <scope-id> [--root <project-context-path>]
  cc-iasd view evidence [--root <project-context-path>]
  cc-iasd view current [--root <project-context-path>]
  cc-iasd view scope <id> [--root <project-context-path>]
  cc-iasd view run <id> [--root <project-context-path>]
  cc-iasd log event --summary <text> [--type <type>] [--source-campaign <id>] [--source-run <id>] [--evidence <path>] [--root <project-context-path>]
  cc-iasd review add <scope-id> --summary <text> --result <text> [--type light|full] [--review-mode <mode>] [--reviewer <name>] [--base-commit <ref>] [--root <project-context-path>]
  cc-iasd open-item add <run-id> --kind <kind> --summary <text> [--target <ref>] [--root <project-context-path>]
  cc-iasd open-item resolve <run-id> <item-id> --resolution resolved|escalated|promoted|deferred [--target <ref>] [--summary <text>] [--root <project-context-path>]
  cc-iasd ideal add <id> --summary <text> [--root <project-context-path>]
  cc-iasd feature add <id> --summary <text> --pillar <name> [--kind epic|supporting] [--root <project-context-path>]
  cc-iasd roadmap add <id> --summary <text> --goal <text> [--root <project-context-path>]
  cc-iasd spec add <id> --summary <text> [--root <project-context-path>]
  cc-iasd reference add historical|external|note <id> --summary <text> [--root <project-context-path>]
  cc-iasd profile update [--root <project-context-path>]
  cc-iasd product outdate ideal <id> [--root <project-context-path>]
  cc-iasd product outdate spec <id> [--root <project-context-path>]
  cc-iasd ops archive feature|roadmap|campaign|run|log|review|report <id> [--root <project-context-path>]
  cc-iasd --help

Options:
  --doc-lang <language>   Documentation language. Default: Japanese
  --dev-lang <language>   Development language. Default: unspecified
  --product-lang <lang>   Product language. Default: same as --doc-lang
  --root <path>           Project-context root for commands. Default: current directory
  --type <type>           Log event type, or review type for review add
  --summary <text>        Log event or review summary
  --result <text>         Review result summary
  --review-mode <mode>    Review mode, such as design-launch or campaign-completion
  --reviewer <name>       Reviewer name for review add. Default: cc-iasd review command
  --base-commit <ref>     Base commit for review add. Default: not-recorded
  --resolution <status>   Open item resolution
  --status <status>       Campaign run status
  --target <ref>          Target artifact reference
  --source-campaign <id>  Source campaign id for log events
  --source-run <id>       Source run id for log events
  --evidence <path>       Related evidence path for log events
  --feature <ref>         Linked feature
  --roadmap <ref>         Linked roadmap
  --spec <ref>            Linked spec
  --tasks <ref>           Linked tasks
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
    scopeId: '',
    runSourceId: '',
    campaignId: '',
    openItemId: '',
    eventType: 'manual',
    eventSummary: '',
    reviewResult: '',
    reviewMode: '',
    reviewer: '',
    baseCommit: '',
    resolution: '',
    status: '',
    targetRef: '',
    sourceCampaign: '',
    sourceRun: '',
    relatedEvidence: '',
    linkedFeature: '',
    linkedRoadmap: '',
    linkedSpec: '',
    linkedTasks: '',
    featureId: '',
    featureKind: 'epic',
    openItemKind: '',
    idealPillar: '',
    idealId: '',
    roadmapId: '',
    roadmapGoal: '',
    specId: '',
    referenceKind: '',
    referenceId: '',
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

  if (!['init', 'doctor', 'run', 'escalate', 'report', 'view', 'log', 'review', 'open-item', 'ideal', 'feature', 'roadmap', 'campaign', 'spec', 'reference', 'profile', 'product', 'ops'].includes(parsed.command)) {
    throw new Error(`Unknown command: ${parsed.command}`);
  }

  if (parsed.command === 'run') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'start') {
      throw new Error('Usage: cc-iasd run start <id>');
    }
    parsed.runSourceId = tokens.shift() ?? '';
    if (!parsed.runSourceId || parsed.runSourceId.startsWith('-')) {
      throw new Error('Usage: cc-iasd run start <id>');
    }
  } else if (parsed.command === 'escalate' || parsed.command === 'report') {
    parsed.scopeId = tokens.shift() ?? '';
    if (!parsed.scopeId || parsed.scopeId.startsWith('-')) {
      throw new Error(`Usage: cc-iasd ${parsed.command} <id>`);
    }
  } else if (parsed.command === 'view') {
    parsed.runTarget = tokens.shift() ?? '';
    if (!['evidence', 'current', 'scope', 'run'].includes(parsed.runTarget)) {
      throw new Error('Usage: cc-iasd view evidence|current|scope|run');
    }
    if (parsed.runTarget === 'scope' || parsed.runTarget === 'run') {
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
    parsed.scopeId = tokens.shift() ?? '';
    if (!parsed.scopeId || parsed.scopeId.startsWith('-')) {
      throw new Error('Usage: cc-iasd review add <scope-id> --summary <text> --result <text>');
    }
  } else if (parsed.command === 'open-item') {
    parsed.runTarget = tokens.shift() ?? '';
    if (!['add', 'resolve'].includes(parsed.runTarget)) {
      throw new Error('Usage: cc-iasd open-item add|resolve ...');
    }
    parsed.scopeId = tokens.shift() ?? '';
    if (!parsed.scopeId || parsed.scopeId.startsWith('-')) {
      throw new Error('Usage: cc-iasd open-item add <run-id> --kind <kind> --summary <text>');
    }
    if (parsed.runTarget === 'resolve') {
      parsed.openItemId = tokens.shift() ?? '';
      if (!parsed.openItemId || parsed.openItemId.startsWith('-')) {
        throw new Error('Usage: cc-iasd open-item resolve <run-id> <item-id> --resolution resolved|escalated|promoted|deferred');
      }
    }
  } else if (parsed.command === 'ideal') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'add') {
      throw new Error('Usage: cc-iasd ideal add <id> --summary <text>');
    }
    parsed.idealId = tokens.shift() ?? '';
    if (!parsed.idealId || parsed.idealId.startsWith('-')) {
      throw new Error('Usage: cc-iasd ideal add <id> --summary <text>');
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
  } else if (parsed.command === 'campaign') {
    parsed.runTarget = tokens.shift() ?? '';
    if (!['add', 'mark-run'].includes(parsed.runTarget)) {
      throw new Error('Usage: cc-iasd campaign add|mark-run ...');
    }
    parsed.campaignId = tokens.shift() ?? '';
    if (!parsed.campaignId || parsed.campaignId.startsWith('-')) {
      throw new Error('Usage: cc-iasd campaign add <id> --summary <text> --roadmap <ref>');
    }
    if (parsed.runTarget === 'mark-run') {
      parsed.scopeId = tokens.shift() ?? '';
      if (!parsed.scopeId || parsed.scopeId.startsWith('-')) {
        throw new Error('Usage: cc-iasd campaign mark-run <campaign-id> <run-id> --status completed|blocked|escalated|deferred');
      }
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
  } else if (parsed.command === 'reference') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'add') {
      throw new Error('Usage: cc-iasd reference add historical|external|note <id> --summary <text>');
    }
    parsed.referenceKind = tokens.shift() ?? '';
    parsed.referenceId = tokens.shift() ?? '';
    if (!['historical', 'external', 'note'].includes(parsed.referenceKind) || !parsed.referenceId || parsed.referenceId.startsWith('-')) {
      throw new Error('Usage: cc-iasd reference add historical|external|note <id> --summary <text>');
    }
  } else if (parsed.command === 'profile') {
    parsed.runTarget = tokens.shift() ?? '';
    if (parsed.runTarget !== 'update') {
      throw new Error('Usage: cc-iasd profile update');
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
      throw new Error('Usage: cc-iasd ops archive feature|roadmap|campaign|run|log|review|report <id>');
    }
    parsed.archiveLayer = tokens.shift() ?? '';
    parsed.archiveId = tokens.shift() ?? '';
    if (!['feature', 'roadmap', 'campaign', 'run', 'log', 'review', 'report'].includes(parsed.archiveLayer) || !parsed.archiveId || parsed.archiveId.startsWith('-')) {
      throw new Error('Usage: cc-iasd ops archive feature|roadmap|campaign|run|log|review|report <id>');
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
      case '--review-mode':
        parsed.reviewMode = readValue(token);
        break;
      case '--reviewer':
        parsed.reviewer = readValue(token);
        break;
      case '--base-commit':
        parsed.baseCommit = readValue(token);
        break;
      case '--resolution':
        parsed.resolution = readValue(token);
        break;
      case '--status':
        parsed.status = readValue(token);
        break;
      case '--target':
        parsed.targetRef = readValue(token);
        break;
      case '--source-campaign':
        parsed.sourceCampaign = readValue(token);
        break;
      case '--source-run':
        parsed.sourceRun = readValue(token);
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
        if (parsed.command === 'open-item') {
          parsed.openItemKind = readValue(token);
        } else {
          parsed.featureKind = readValue(token);
        }
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
  'runtime/profile.md',
  'runtime/plugins.yaml',
  'runtime/adapters/README.md',
  'runtime/adapters/role-runtime.md',
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
  'ops/execution/campaigns',
  'ops/execution/campaigns/archived',
  'ops/execution/runs',
  'ops/execution/runs/archived',
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
  'development-docs',
  'ops/ideal',
  'ops/specs',
  'ops/features',
  'ops/roadmaps',
  'ops/milestones/project-context/reviews',
  'ops/scopes/milestones',
  'ops/cycles',
  'ops/logs',
  'ops/reviews',
  'ops/decisions.md',
  'ops/evidence-index.md',
  'ops/knowledge.md',
];

const forbiddenContent = [
  'development-docs',
  'ops/ideal/',
  'ops/specs/',
  'ops/features/',
  'ops/roadmaps/',
  'ops/milestones/project-context/reviews',
  'ops/scopes/milestones/',
  'ops/cycles/',
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
    ['ops/execution/campaigns/', 'ops/execution/campaigns/archived/'],
    ['ops/execution/runs/', 'ops/execution/runs/archived/'],
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
      issues.push(`Forbidden path exists: ${relPath}`);
    }
  }

  if (await exists(root)) {
    const files = await collectMarkdownFiles(root);
    for (const file of files) {
      const content = await readFile(path.join(root, file), 'utf8');
      for (const marker of forbiddenContent) {
        if (content.includes(marker)) {
          issues.push(`Forbidden reference "${marker}" in ${file}`);
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

    await validateCampaignFiles(root, issues);
    await validateRunFiles(root, issues);
    await validateIdealFiles(root, issues);
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

const extractMarkdownSection = (content, heading) => {
  const marker = `## ${heading}`;
  const start = content.indexOf(marker);
  if (start === -1) return '';
  const bodyStart = content.indexOf('\n', start);
  if (bodyStart === -1) return '';
  const nextHeading = content.indexOf('\n## ', bodyStart + 1);
  return content.slice(bodyStart + 1, nextHeading === -1 ? undefined : nextHeading).trim();
};

const hasAuthoredContent = (content) => content
  .split('\n')
  .map((line) => line.trim())
  .some((line) => line && line !== '- TBD' && line !== 'TBD' && !line.startsWith('- UNRESOLVED') && !line.startsWith('UNRESOLVED'));

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
        `product/specs/${value}/spec.md`,
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

const validateCampaignFiles = async (root, issues) => {
  const campaignDirs = await listDirectories(root, 'ops/execution/campaigns');
  for (const campaignDir of campaignDirs) {
    if (path.basename(campaignDir) === 'archived') continue;
    const basename = path.basename(campaignDir);
    if (!/^c[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(basename)) {
      issues.push(`Invalid campaign directory name: ${campaignDir}`);
    }

    for (const fileName of ['plan.md', 'state.md', 'queue.md', 'aggregate-report.md']) {
      const relPath = `${campaignDir}/${fileName}`;
      if (!await exists(path.join(root, relPath))) {
        issues.push(`Missing campaign file: ${relPath}`);
      }
    }
    const campaignFiles = await listMarkdownFiles(root, campaignDir);
    for (const file of campaignFiles) {
      if (!['plan.md', 'state.md', 'queue.md', 'aggregate-report.md'].includes(path.basename(file))) {
        issues.push(`Unexpected campaign file: ${file}`);
      }
    }

    const content = await readOptionalText(root, `${campaignDir}/plan.md`);
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
        issues.push(`Broken campaign link in ${campaignDir}/plan.md: ${label} ${value}`);
      }
    }
  }
};

const validateRunFiles = async (root, issues) => {
  const runDirs = await listDirectories(root, 'ops/execution/runs');
  for (const runDir of runDirs) {
    if (path.basename(runDir) === 'archived') continue;
    const basename = path.basename(runDir);
    if (!/^run_[0-9]{17}_[a-z0-9][a-z0-9-]*$/.test(basename)) {
      issues.push(`Invalid run directory name: ${runDir}`);
    }

    for (const fileName of ['plan.md', 'handoff.md', 'state.md', 'open-items.md', 'knowledge.md']) {
      const relPath = `${runDir}/${fileName}`;
      if (!await exists(path.join(root, relPath))) {
        issues.push(`Missing run file: ${relPath}`);
      }
    }
    const runFiles = await listMarkdownFiles(root, runDir);
    for (const file of runFiles) {
      if (!['plan.md', 'handoff.md', 'state.md', 'open-items.md', 'knowledge.md'].includes(path.basename(file))) {
        issues.push(`Unexpected run file: ${file}`);
      }
    }

    const plan = await readOptionalText(root, `${runDir}/plan.md`);
    if (!hasAuthoredContent(extractMarkdownSection(plan, 'Selected Tasks'))) {
      issues.push(`Missing selected tasks in ${runDir}/plan.md`);
    }
  }
};

const validateIdealFiles = async (root, issues) => {
  const files = await listMarkdownFiles(root, 'product/ideal');
  for (const file of files) {
    const basename = path.basename(file);
    if (!/^i[0-9]{3}-[a-z0-9][a-z0-9-]*\.md$/.test(basename)) {
      issues.push(`Invalid ideal file name: ${file}`);
    }
    const content = await readFile(path.join(root, file), 'utf8');
    const summary = extractField(content, 'Summary');
    const status = extractField(content, 'Status');
    if (isUnset(summary)) {
      issues.push(`Missing ideal summary in ${file}`);
    }
    if (isUnset(status)) {
      issues.push(`Missing ideal status in ${file}`);
    }
    for (const section of ['Product Ideal', 'Experience Principles', 'Boundaries']) {
      if (!hasAuthoredContent(extractMarkdownSection(content, section))) {
        issues.push(`Missing ideal ${section} content in ${file}`);
      }
    }
  }
};

const validateFeatureFiles = async (root, issues) => {
  const files = await listMarkdownFiles(root, 'ops/scopes/features');
  for (const file of files) {
    const basename = path.basename(file);
    if (!/^f[0-9]{3}-[a-z0-9][a-z0-9-]*\.md$/.test(basename)) {
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
    if (!/^r[0-9]{3}-[a-z0-9][a-z0-9-]*\.md$/.test(basename)) {
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
    if (!/^s[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(basename)) {
      issues.push(`Invalid spec directory name: ${specDir}`);
    }

    const requiredSpecFiles = [
      'spec.md',
      'plan.md',
      'research.md',
      'data-model.md',
      'contracts/README.md',
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
    const reviewer = extractField(content, 'Reviewer');
    const baseCommit = extractField(content, 'Base Commit');
    const reviewType = extractField(content, 'Review Type');
    const result = extractField(content, 'Result');

    if (isUnset(reviewer)) {
      issues.push(`Missing review reviewer in ${file}`);
    }
    if (isUnset(baseCommit)) {
      issues.push(`Missing review base commit in ${file}`);
    }
    if (!['light', 'full'].includes(reviewType)) {
      issues.push(`Invalid review type in ${file}: ${reviewType || 'missing'}`);
    }
    if (isUnset(result)) {
      issues.push(`Missing review result in ${file}`);
    }
    if (!hasAuthoredContent(extractMarkdownSection(content, 'Review Notes'))) {
      issues.push(`Missing review notes in ${file}`);
    }
    if (!hasAuthoredContent(extractMarkdownSection(content, 'Implementation Response Plan'))) {
      issues.push(`Missing review implementation response plan in ${file}`);
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

const replaceLine = (content, prefix, nextLine) => {
  const lines = content.split('\n');
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index === -1) return content;
  lines[index] = nextLine;
  return lines.join('\n');
};

const appendSection = (content, section) => {
  const trimmed = content.endsWith('\n') ? content : `${content}\n`;
  return `${trimmed}${section}`;
};

const openItemStatusValues = ['open', 'resolved', 'escalated', 'promoted', 'deferred'];

const openItemKindValues = [
  'product-decision',
  'spec-refinement',
  'scope-refinement',
  'implementation-debt',
  'blocker',
  'follow-up',
];

const ensureRunId = (runId) => {
  if (!/^run_[0-9]{17}_[a-z0-9][a-z0-9-]*$/.test(runId)) {
    throw new Error('Run id must match run_<timestamp>_<source-id>');
  }
};

const updateTextFile = async (root, relPath, updater, args, created) => {
  const current = await readOptionalText(root, relPath);
  if (!current) {
    throw new Error(`Cannot update missing file: ${relPath}`);
  }
  const next = updater(current);
  if (next === current) {
    created.skipped.push(relPath);
    return;
  }
  await writeText(root, relPath, next, { ...args, force: true }, created);
};

const nextOpenItemId = (content) => {
  const ids = [...content.matchAll(/^- ID: oi-([0-9]{3})$/gm)].map((match) => Number(match[1]));
  const next = Math.max(0, ...ids) + 1;
  return `oi-${String(next).padStart(3, '0')}`;
};

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
  'Planning backlog for feature-scoped work candidates that have not yet been cut into roadmap, spec, or task artifacts.',
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
  '## Backtrack Signals',
  '',
  '- Missing ideal connection',
  '- Missing priority',
  '- Missing impact scope',
  '- Missing human decision',
  '- Missing target destination',
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
  '- Deferred: TBD',
  '- Blocked: TBD',
  '',
  '## Roadmap Notes',
  '',
  '- TBD',
  '',
  '## Backlog',
  '',
  '- None',
  '',
  '## Quality Requirements',
  '',
  '- Linked ideal pillar is explicit or ideal gap is reported.',
  '- Included, excluded, deferred, and blocked scope are separated.',
  '- Backlog items include priority, experience tie, impact scope, blockers, target destination, and source.',
  '- Human decision gaps are listed instead of being resolved by assumption.',
  '- Spec Designer can derive a spec boundary without inventing feature scope or product value.',
  '',
].join('\n');

const idealFileTemplate = ({ idealId, summary, now }) => [
  `# Ideal: ${idealId}`,
  '',
  `- ID: ${idealId}`,
  `- Summary: ${summary}`,
  '- Status: current',
  `- Created At: ${now}`,
  '',
  '## Product Ideal',
  '',
  '- TBD',
  '',
  '## Experience Principles',
  '',
  '- TBD',
  '',
  '## Boundaries',
  '',
  '- TBD',
  '',
  '## Non-Goals',
  '',
  '- TBD',
  '',
  '## Priority Signals',
  '',
  '- TBD',
  '',
  '## Human Decision Points',
  '',
  '- Confirmed: none recorded',
  '- Unresolved: none recorded',
  '',
  '## Downstream Feature Inputs',
  '',
  '- TBD',
  '',
  '## Quality Requirements',
  '',
  '- Product intent is specific enough that Feature Scope Designer does not need to invent product direction.',
  '- Experience principles can guide feature scope design.',
  '- Boundaries and non-goals are explicit.',
  '- Priority signals are present or unresolved priority decisions are listed.',
  '- Infrastructure, cost, security, privacy, external service, and data-retention decisions are either decided or listed as unresolved.',
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
  '## Campaigns / Runs',
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

const specTemplate = ({ specId, summary, now }) => [
  `# Feature Specification: ${specId}`,
  '',
  `- ID: ${specId}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '- Status: draft',
  '',
  '## User Scenarios & Testing',
  '',
  '- TBD',
  '',
  '## Requirements',
  '',
  '- TBD',
  '',
  '## Success Criteria',
  '',
  '- TBD',
  '',
  '## Source Trace',
  '',
  '- Source Feature: TBD',
  '- Relevant Ideal: TBD',
  '- Human Decisions: TBD',
  '',
  '## Quality Requirements',
  '',
  '- Requirements trace to feature scope and relevant ideal context.',
  '- User scenarios, requirements, and success criteria are specific enough for task design.',
  '- Unresolved product or human decisions are listed instead of hidden in requirements.',
  '- Campaign planning can derive feature/spec coverage and expected user experience outcome.',
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
  '## Implementation Boundaries',
  '',
  '- Likely Touched Surfaces: TBD',
  '- Related Impact Surfaces: TBD',
  '- Non-Regression Focus: TBD',
  '- Escalation Triggers: TBD',
  '',
].join('\n');

const specResearchTemplate = ({ specId, summary, now }) => [
  `# Research: ${specId}`,
  '',
  `- ID: ${specId}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '',
  '## Decisions',
  '',
  '- None recorded.',
  '',
  '## Alternatives Considered',
  '',
  '- None recorded.',
  '',
  '## Open Questions',
  '',
  '- None recorded.',
  '',
  '## Human Decision Routing',
  '',
  '- Decisions required before implementation: none recorded.',
  '- Decisions safe for autonomous proceed: none recorded.',
  '',
].join('\n');

const specDataModelTemplate = ({ specId, summary, now }) => [
  `# Data Model: ${specId}`,
  '',
  `- ID: ${specId}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '',
  '## Entities',
  '',
  '- None recorded.',
  '',
  '## Relationships',
  '',
  '- None recorded.',
  '',
  '## Validation Rules',
  '',
  '- None recorded.',
  '',
  '## Data Decision Status',
  '',
  '- Privacy / retention decisions required: none recorded.',
  '- Migration or irreversible data changes required: none recorded.',
  '',
].join('\n');

const specContractsTemplate = ({ specId, summary, now }) => [
  `# Contracts: ${specId}`,
  '',
  `- ID: ${specId}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '',
  'Contract artifacts live in this directory when the spec needs API, event, CLI, schema, or integration contracts.',
  '',
  '## Contract Decision Status',
  '',
  '- External service or integration decisions required: none recorded.',
  '- Security / permission decisions required: none recorded.',
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
  '## Task Quality Requirements',
  '',
  '- Each task has an expected local outcome.',
  '- Each task identifies likely touched surfaces or states why they are unknown.',
  '- Each task identifies related impact surfaces and non-regression focus.',
  '- Each task has local verification guidance.',
  '- Tasks do not contain unresolved human decisions as implementation instructions.',
  '',
].join('\n');

const campaignPlanTemplate = ({ campaignId, summary = 'TBD', now, linkedFeature, linkedRoadmap, linkedSpec, linkedTasks }) => [
  `# Campaign Plan: ${campaignId}`,
  '',
  `- Campaign ID: ${campaignId}`,
  `- Summary: ${summary}`,
  '- Status: planned',
  `- Linked Feature: ${linkedFeature || 'TBD'}`,
  `- Linked Roadmap: ${linkedRoadmap || 'TBD'}`,
  `- Linked Spec: ${linkedSpec || 'TBD'}`,
  `- Linked Tasks: ${linkedTasks || 'TBD'}`,
  `- Created At: ${now}`,
  '',
  '## User Experience Outcome',
  '',
  '- Outcome: TBD',
  '- Direct User Impact: TBD',
  '- Non-Goals: TBD',
  '',
  '## Feature / Spec Coverage',
  '',
  '- Covered Feature Items: TBD',
  '- Covered Spec Requirements: TBD',
  '- Covered Tasks: TBD',
  '- Deferred Items: TBD',
  '',
  '## Task Selector',
  '',
  '- TBD',
  '',
  '## Stop Conditions',
  '',
  '- TBD',
  '',
  '## Progression Conditions',
  '',
  '- TBD',
  '',
  '## Cross-Run Non-Regression Focus',
  '',
  '- Existing behaviors to preserve across runs: TBD',
  '',
  '## Impact Map',
  '',
  '- Related UX / screens: TBD',
  '- Related APIs / contracts: TBD',
  '- Related data / permissions / config: TBD',
  '- Related integrations: TBD',
  '',
  "## Devil's Advocate Focus",
  '',
  '- Focus Items: TBD',
  "- Rationale: This does not limit Devil's Advocate review scope; it identifies especially important risks to inspect.",
  '',
  "## Devil's Advocate Design Launch Review",
  '',
  '- Required Before First Run: yes',
  '- Review Evidence: TBD',
  '- Launch Decision: pending',
  '- Blocking Findings: TBD',
  '',
  '## Completion Conditions',
  '',
  '- Campaign complete when: TBD',
  '- Completion report ready when: TBD',
  '- Implementation review ready when: TBD',
  "- Devil's Advocate Campaign Completion Review ready when: TBD",
  '',
].join('\n');

const campaignStateTemplate = ({ campaignId, now }) => [
  `# Campaign State: ${campaignId}`,
  '',
  `- Campaign ID: ${campaignId}`,
  '- Result: in-progress',
  '- Active Blocker: none recorded',
  `- Started At: ${now}`,
  `- Last Update: ${now}`,
  '',
].join('\n');

const campaignQueueTemplate = ({ campaignId }) => [
  `# Campaign Queue: ${campaignId}`,
  '',
  '| Order | Run Source | Selected Tasks | Status | Run |',
  '| --- | --- | --- | --- | --- |',
  '',
].join('\n');

const campaignAggregateReportTemplate = ({ campaignId, now }) => [
  `# Campaign Aggregate Report: ${campaignId}`,
  '',
  `- Campaign ID: ${campaignId}`,
  `- Created At: ${now}`,
  '',
  '## Progression Summary',
  '',
  '- TBD',
  '',
  '## Remaining Decisions',
  '',
  '- TBD',
  '',
].join('\n');

const runPlanTemplate = ({ runId, sourceId, now, linkedFeature, linkedRoadmap, linkedCampaign, linkedSpec, linkedTasks }) => [
  `# Run Plan: ${runId}`,
  '',
  `- Run ID: ${runId}`,
  `- Source ID: ${sourceId}`,
  `- Linked Feature: ${linkStatus('Linked Feature', linkedFeature)}`,
  `- Linked Roadmap: ${linkStatus('Linked Roadmap', linkedRoadmap)}`,
  `- Linked Campaign: ${linkStatus('Linked Campaign', linkedCampaign)}`,
  `- Linked Spec: ${linkStatus('Linked Spec', linkedSpec)}`,
  `- Linked Tasks: ${linkStatus('Linked Tasks', linkedTasks)}`,
  `- Created At: ${now}`,
  '',
  '## Selected Tasks',
  '',
  `- ${linkedTasks || linkStatus('Linked Tasks', linkedSpec)}`,
  '',
].join('\n');

const runStateTemplate = ({ runId, sourceId, now, linkedFeature, linkedRoadmap, linkedCampaign, linkedSpec, linkedTasks }) => [
  `# Run State: ${runId}`,
  '',
  `- Run ID: ${runId}`,
  `- Source ID: ${sourceId}`,
  '- Result: in-progress',
  '- Active Blocker: none recorded',
  `- Started At: ${now}`,
  `- Last Update: ${now}`,
  '',
  '## Scope Links',
  '',
  `- Linked Feature: ${linkStatus('Linked Feature', linkedFeature)}`,
  `- Linked Roadmap: ${linkStatus('Linked Roadmap', linkedRoadmap)}`,
  `- Linked Campaign: ${linkStatus('Linked Campaign', linkedCampaign)}`,
  `- Linked Spec: ${linkStatus('Linked Spec', linkedSpec)}`,
  `- Linked Tasks: ${linkStatus('Linked Tasks', linkedTasks)}`,
  '',
  '## Run Readiness Snapshot',
  '',
  '- Expected Local Outcome: TBD',
  '- Likely Touched Surfaces: TBD',
  '- Related Impact Surfaces: TBD',
  '- Non-Regression Focus: TBD',
  '- Escalation Triggers: TBD',
  '- Local Verification: TBD',
  '',
  '## Review Evidence',
  '',
  '- Review References: TBD',
  '- Review Result: TBD',
  '',
  '## Open Items',
  '',
  `- Open Items File: ops/execution/runs/${runId}/open-items.md`,
  '- Open Item Summary: use `cc-iasd open-item add` and `cc-iasd open-item resolve` to maintain operational metadata.',
  '',
  '## Remaining Risk',
  '',
  '- TBD',
  '',
].join('\n');

const runHandoffTemplate = ({ runId, sourceId, linkedFeature, linkedRoadmap, linkedCampaign, linkedSpec, linkedTasks }) => [
  `# Run Handoff: ${runId}`,
  '',
  '## Scope',
  '',
  `Run: ${runId}`,
  `Source: ${sourceId}`,
  '',
  '## Source Root',
  '',
  'src/',
  '',
  '## Linked Planning Artifacts',
  '',
  `- Feature: ${linkStatus('Linked Feature', linkedFeature)}`,
  `- Roadmap: ${linkStatus('Linked Roadmap', linkedRoadmap)}`,
  `- Campaign: ${linkStatus('Linked Campaign', linkedCampaign)}`,
  `- Spec: ${linkStatus('Linked Spec', linkedSpec)}`,
  `- Tasks: ${linkStatus('Linked Tasks', linkedTasks)}`,
  '',
  '## Constraints',
  '',
  '- Do not change roadmap, feature scope, campaign purpose, or selected tasks without human approval.',
  '- Keep implementation file creation inside `src/`.',
  '- Use cc-iasd commands or explicit human file operations for new project-context artifacts.',
  '- Edit only authored content sections in command-created project-context artifacts.',
  '',
  '## Selected Tasks',
  '',
  `- ${linkedTasks || linkStatus('Linked Tasks', linkedSpec)}`,
  '',
  '## Expected Local Outcome',
  '',
  '- TBD',
  '',
  '## Likely Touched Surfaces',
  '',
  '- TBD',
  '',
  '## Related Impact Surfaces',
  '',
  '- TBD',
  '',
  '## Non-Regression Focus',
  '',
  '- TBD',
  '',
  '## Escalation Triggers',
  '',
  '- User decision required: TBD',
  '- Unexpected architecture boundary crossing: TBD',
  '- UX / data / security boundary change required: TBD',
  '- Scope expansion required: TBD',
  '',
  '## Local Verification',
  '',
  '- Tests / lint / build: TBD',
  '- Manual checks: TBD',
  '- Review focus for Code Quality Auditor: TBD',
  '',
  '## Open Item Routing',
  '',
  '- Resolve in this run: TBD',
  '- Escalate to human decision: TBD',
  '- Promote to feature backlog: TBD',
  '- Return to spec / campaign planning: TBD',
  '- Defer with report rationale: TBD',
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

const runOpenItemsTemplate = ({ runId }) => [
  `# Run Open Items: ${runId}`,
  '',
  'Tool-owned metadata lines are created and updated by cc-iasd commands. AI agents may edit authored Background, Options, Recommendation, and Notes sections after entries are created.',
  '',
  '## Items',
  '',
  '- None',
  '',
].join('\n');

const runKnowledgeTemplate = ({ runId, now }) => [
  `# Run Knowledge: ${runId}`,
  '',
  `- Run ID: ${runId}`,
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

const openItemEntryTemplate = ({ itemId, runId, kind, summary, targetRef, now }) => [
  `### ${itemId}`,
  '',
  `- ID: ${itemId}`,
  `- Kind: ${kind}`,
  '- Status: open',
  `- Summary: ${summary}`,
  `- Source Run: ${runId}`,
  `- Target: ${targetRef || 'TBD'}`,
  '- Resolution: TBD',
  `- Created At: ${now}`,
  `- Updated At: ${now}`,
  '',
  '#### Background',
  '',
  '- TBD',
  '',
  '#### Options',
  '',
  '- TBD',
  '',
  '#### Recommendation',
  '',
  '- TBD',
  '',
  '#### Notes',
  '',
  '- TBD',
  '',
].join('\n');

const referenceFileTemplate = ({ referenceKind, referenceId, summary, now }) => [
  `# Reference: ${referenceId}`,
  '',
  `- ID: ${referenceId}`,
  `- Kind: ${referenceKind}`,
  `- Summary: ${summary}`,
  `- Created At: ${now}`,
  '- Canonical Successor: TBD',
  '',
  '## Notes',
  '',
  '- TBD',
  '',
  '## Source Material',
  '',
  '- TBD',
  '',
].join('\n');

const completionReportTemplate = ({ scopeId, scopePath, now, runStates, reviewFiles, reportFiles }) => [
  `# Completion Report: ${scopeId}`,
  '',
  `- Scope ID: ${scopeId}`,
  `- Source Artifact: ${scopePath}`,
  `- Generated At: ${now}`,
  '',
  '## Scope Summary',
  '',
  '- TBD',
  '',
  '## Source Runs',
  '',
  ...(runStates.length ? runStates.map((entry) => `- ${entry.path}`) : ['- No run state files found.']),
  '',
  '## Review Evidence',
  '',
  ...(reviewFiles.length ? reviewFiles.map((file) => `- ${file}`) : ['- No review files found.']),
  '',
  '## Related Reports',
  '',
  ...(reportFiles.length ? reportFiles.map((file) => `- ${file}`) : ['- No related reports found.']),
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

const reviewRecordTemplate = ({ scopeId, now, reviewType, reviewMode, summary, result, reviewer, baseCommit }) => [
  `# Review: ${scopeId}`,
  '',
  `- Date: ${now}`,
  `- Reviewer: ${reviewer || 'cc-iasd review command'}`,
  `- Base Commit: ${baseCommit || 'not-recorded'}`,
  `- Scope: ${summary}`,
  `- Scope ID: ${scopeId}`,
  `- Review Type: ${reviewType}`,
  `- Review Mode: ${reviewMode || 'none'}`,
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
  '- No additional review notes recorded by command.',
  '',
  '## Implementation Response Plan',
  '',
  '- Planned Fixes: none recorded.',
  '- Deferred Items: none recorded.',
  '',
].join('\n');

const escalationTemplate = ({ scopeId, now, scopeContent, runStates, activeBlocker, linkedSpec, linkedTasks }) => [
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
  scopeContent.trim() || 'No scope content found.',
  '',
  '## Evidence So Far',
  '',
  ...(runStates.length ? runStates.flatMap((entry) => [
    `### ${entry.path}`,
    '',
    entry.content.trim() || 'No state.md content found.',
    '',
  ]) : ['No run state files found.', '']),
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
    `- Scope: ${entry.scope || 'missing'}`,
    '- Runs:',
    ...(entry.runs.length ? entry.runs.map((run) => `  - ${run}`) : ['  - none']),
    '- Reports:',
    ...(entry.reports.length ? entry.reports.map((report) => `  - ${report}`) : ['  - none']),
    '- Reviews:',
    ...(entry.reviews.length ? entry.reviews.map((review) => `  - ${review}`) : ['  - none']),
    '',
  ]) : ['- No evidence artifacts found.', '']),
].join('\n');

const currentViewTemplate = ({ now, ideals, specs, features, roadmaps, campaigns, runs, logs, reviews, reports }) => [
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
  '',
  '## Execution And Evidence',
  '',
  '- Campaigns:',
  ...(campaigns.length ? campaigns.map((item) => `  - ${item}`) : ['  - none']),
  '- Runs:',
  ...(runs.length ? runs.map((item) => `  - ${item}`) : ['  - none']),
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

const scopeViewTemplate = ({ now, scopeId, boundary, sections, relatedRuns, relatedReviews, relatedReports }) => [
  `# Scope Boundary View: ${scopeId}`,
  '',
  `- Generated At: ${now}`,
  '',
  '## Boundary Graph',
  '',
  '- Features:',
  ...(boundary.features.length ? boundary.features.map((item) => `  - ${item}`) : ['  - none']),
  '- Roadmaps:',
  ...(boundary.roadmaps.length ? boundary.roadmaps.map((item) => `  - ${item}`) : ['  - none']),
  '- Specs:',
  ...(boundary.specs.length ? boundary.specs.map((item) => `  - ${item}`) : ['  - none']),
  '- Campaigns:',
  ...(boundary.campaigns.length ? boundary.campaigns.map((item) => `  - ${item}`) : ['  - none']),
  '- Runs:',
  ...(boundary.runs.length ? boundary.runs.map((item) => `  - ${item}`) : ['  - none']),
  '',
  '## Boundary Artifacts',
  '',
  ...(sections.length ? sections.flatMap((section) => contentSection(section.title, section.path, section.content)) : ['- No matching boundary artifacts found.', '']),
  '## Related Evidence',
  '',
  '- Runs:',
  ...(relatedRuns.length ? relatedRuns.map((item) => `  - ${item}`) : ['  - none']),
  '- Reviews:',
  ...(relatedReviews.length ? relatedReviews.map((item) => `  - ${item}`) : ['  - none']),
  '- Reports:',
  ...(relatedReports.length ? relatedReports.map((item) => `  - ${item}`) : ['  - none']),
  '',
].join('\n');

const runViewTemplate = ({ now, runId, sections }) => [
  `# Run View: ${runId}`,
  '',
  `- Generated At: ${now}`,
  '',
  ...(sections.length ? sections.flatMap((section) => contentSection(section.title, section.path, section.content)) : ['- No matching run artifact found.', '']),
].join('\n');

const logEventTemplate = ({ now, eventType, summary, sourceCampaign, sourceRun, relatedEvidence }) => [
  '# Log Event',
  '',
  `- Date: ${now}`,
  `- Type: ${eventType}`,
  `- Summary: ${summary}`,
  `- Source Campaign: ${sourceCampaign || 'none'}`,
  `- Source Run: ${sourceRun || 'none'}`,
  `- Related Evidence: ${relatedEvidence || 'none'}`,
  '',
  '## Notes',
  '',
  '- TBD',
  '',
].join('\n');

const runtimePluginsTemplate = ({ now }) => [
  `generated_at: ${now}`,
  'profile: default',
  'spec_profile:',
  '  name: spec-kit-compatible-artifact-vocabulary',
  '  owner: cc-iasd',
  '  artifacts_root: product/specs',
  'implementation_runtime:',
  '  type: external-agent',
  '  adapter: generic-markdown-handoff',
  '  source_root: src',
  'role_runtime:',
  '  type: generated-manifest',
  '  manifest: runtime/adapters/role-runtime.md',
  'source_provenance_adapter:',
  '  type: none',
  '  policy_owner: project',
  '',
].join('\n');

const runtimeProfileTemplate = ({ now }) => [
  '# Runtime Profile',
  '',
  `- Generated At: ${now}`,
  `- cc-iasd Version: ${VERSION}`,
  '- Profile: default',
  '- Schema Version: 1',
  '',
  '## Update Policy',
  '',
  '`cc-iasd profile update` adds missing runtime profile, plugin, and adapter files without overwriting existing files unless `--force` is supplied.',
  '',
  '## Migration Policy',
  '',
  '- Product canon is not rewritten automatically.',
  '- Ops artifacts are not rewritten automatically.',
  '- Runtime adapter files may be regenerated from current rules and roles.',
  '- User-authored files require explicit human review before migration.',
  '',
].join('\n');

const runtimeAdaptersReadmeTemplate = () => [
  '# Runtime Adapters',
  '',
  'This directory contains generated adapter metadata for external implementation runtimes.',
  '',
  'Adapters connect cc-iasd artifacts to runtimes. They do not execute the runtime and they do not place cc-iasd-managed files under `src/`.',
  '',
].join('\n');

const extractRoleCommandVisibility = (content) => {
  const section = extractMarkdownSection(content, 'Command Visibility');
  if (!section) return ['- No explicit command visibility section found.'];
  const commands = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- `cc-iasd '));
  return commands.length ? commands : ['- No role-visible cc-iasd commands declared.'];
};

const roleRuntimeTemplate = ({ now, roleEntries }) => [
  '# Role Runtime Manifest',
  '',
  `- Generated At: ${now}`,
  '- Source Root: rules/roles',
  '- Target Runtime: generic-markdown',
  '',
  '## Roles',
  '',
  ...(roleEntries.length ? roleEntries.map((entry) => `- ${path.basename(entry.file, '.md')}: ${entry.file}`) : ['- None']),
  '',
  '## Command Visibility By Role',
  '',
  ...(roleEntries.length ? roleEntries.flatMap((entry) => [
    `### ${path.basename(entry.file, '.md')}`,
    '',
    ...entry.commands,
    '',
  ]) : ['- None', '']),
  '',
  '## Generation Rule',
  '',
  'Role runtime metadata is generated from canonical role files under `rules/roles/`. Tool-specific wrappers may refer to these files, but the canonical role text remains under `rules/roles/`.',
  '',
  'Only expose the commands listed for the active role when preparing role-specific runtime context.',
  '',
  '## Role Invocation Metadata',
  '',
  '- Designer roles may return `Backtrack Request` instead of authored artifacts when upstream context is insufficient.',
  '- Backtrack Request metadata must include blocked stage, missing upstream artifact, missing information, evidence from current artifact, risk if continued by assumption, recommended return role, narrow context needed, and resume condition.',
  '- Devil\'s Advocate must be invoked with `Review Mode: Design Launch Review` before campaign execution when campaign launch risk is inspected.',
  '- Devil\'s Advocate must be invoked with `Review Mode: Campaign Completion Review` before campaign completion is accepted.',
  '- Planning Lead routes Backtrack Requests and review-mode invocation metadata. Planning Lead does not judge ideal, feature, or spec artifact quality directly.',
  '',
  '## Context Compression Recovery',
  '',
  '- After context compression, the active role must rerun the context-loading commands listed in its canonical role prompt.',
  '- Compressed handoff must preserve active role, current phase, active artifact IDs and paths, active campaign/run IDs, pending Backtrack Request or review finding, review mode, changed files, evidence paths, and next intended action.',
  '- Compressed handoff is not authoritative artifact state. Resume from command output and direct artifact reads, not from compressed summaries.',
  '',
].join('\n');

const writableRoleFiles = async (root) => {
  const files = await listMarkdownFiles(root, 'rules/roles');
  return files
    .filter((file) => !['README.md', 'PATH_CONVENTION.md'].includes(path.basename(file)))
    .sort();
};

const writeRuntimeProfileFiles = async (root, args, created) => {
  const now = new Date().toISOString();
  const roleFiles = await writableRoleFiles(root);
  const roleEntries = [];
  for (const file of roleFiles) {
    const content = await readOptionalText(root, file);
    roleEntries.push({ file, commands: extractRoleCommandVisibility(content) });
  }
  await writeText(root, 'runtime/profile.md', runtimeProfileTemplate({ now }), args, created);
  await writeText(root, 'runtime/plugins.yaml', runtimePluginsTemplate({ now }), args, created);
  await writeText(root, 'runtime/adapters/README.md', runtimeAdaptersReadmeTemplate(), args, created);
  await writeText(root, 'runtime/adapters/role-runtime.md', roleRuntimeTemplate({ now, roleEntries }), args, created);
};

const updateProfile = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  if (!await exists(root)) {
    throw new Error(`Project-context does not exist: ${root}`);
  }
  const created = { written: [], skipped: [] };
  await writeRuntimeProfileFiles(root, args, created);
  return { root, written: created.written, skipped: created.skipped };
};

const listRunStateEntries = async (root, scopeId) => {
  const runDirs = await listDirectories(root, 'ops/execution/runs');
  const entries = [];
  for (const runDir of runDirs) {
    if (path.basename(runDir) === 'archived') continue;
    const statePath = `${runDir}/state.md`;
    const content = await readOptionalText(root, statePath);
    if (!content) continue;
    if (
      extractField(content, 'Run ID') !== scopeId
      && extractField(content, 'Source ID') !== scopeId
      && extractField(content, 'Linked Campaign') !== scopeId
      && extractField(content, 'Linked Spec') !== scopeId
      && !path.basename(runDir).endsWith(`_${scopeId}`)
    ) {
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

const normalizeBoundaryRef = (value) => {
  if (isUnset(value)) return '';
  const cleaned = value
    .trim()
    .replace(/^[-*]\s+/, '')
    .replaceAll('`', '')
    .replace(/\.md$/, '')
    .replace(/\/$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  const typedDirs = [
    ['features', 'features'],
    ['roadmaps', 'roadmaps'],
    ['campaigns', 'campaigns'],
    ['runs', 'runs'],
    ['specs', 'specs'],
  ];
  for (const [marker] of typedDirs) {
    const index = parts.indexOf(marker);
    if (index !== -1 && parts[index + 1]) return parts[index + 1];
  }
  return path.basename(cleaned);
};

const addBoundaryId = (boundary, id) => {
  if (isUnset(id)) return;
  if (/^f\d{3}-/.test(id)) boundary.features.add(id);
  if (/^r\d{3}-/.test(id)) boundary.roadmaps.add(id);
  if (/^s\d{3}-/.test(id)) boundary.specs.add(id);
  if (/^c\d{3}-/.test(id)) boundary.campaigns.add(id);
  if (/^run_/.test(id)) boundary.runs.add(id);
};

const boundaryIds = (boundary) => new Set([
  ...boundary.features,
  ...boundary.roadmaps,
  ...boundary.specs,
  ...boundary.campaigns,
  ...boundary.runs,
]);

const linkedIdsFromContent = (content) => [
  extractField(content, 'Campaign ID'),
  extractField(content, 'Run ID'),
  extractField(content, 'Source ID'),
  extractField(content, 'Linked Feature'),
  extractField(content, 'Linked Roadmap'),
  extractField(content, 'Linked Campaign'),
  extractField(content, 'Linked Spec'),
  extractField(content, 'Linked Tasks'),
].map(normalizeBoundaryRef).filter(Boolean);

const absorbLinkedIds = (boundary, content) => {
  for (const id of linkedIdsFromContent(content)) {
    addBoundaryId(boundary, id);
  }
};

const hasBoundaryIntersection = (seedId, knownIds, content) => linkedIdsFromContent(content)
  .some((id) => id === seedId || knownIds.has(id));

const toBoundaryList = (boundary) => ({
  features: [...boundary.features].sort(),
  roadmaps: [...boundary.roadmaps].sort(),
  specs: [...boundary.specs].sort(),
  campaigns: [...boundary.campaigns].sort(),
  runs: [...boundary.runs].sort(),
});

const collectBoundaryEvidence = async (root, boundary) => {
  const ids = boundaryIds(boundary);
  const relatedRuns = new Set();
  const relatedReviews = new Set();
  const relatedReports = new Set();
  for (const runId of boundary.runs) {
    const runStatePath = `ops/execution/runs/${runId}/state.md`;
    if (await exists(path.join(root, runStatePath))) relatedRuns.add(runStatePath);
  }
  for (const id of ids) {
    for (const entry of await listRunStateEntries(root, id)) relatedRuns.add(entry.path);
    for (const review of await listReviewFilesForScope(root, id)) relatedReviews.add(review);
    for (const report of await listReportFilesForScope(root, id)) relatedReports.add(report);
  }
  return {
    relatedRuns: [...relatedRuns].sort(),
    relatedReviews: [...relatedReviews].sort(),
    relatedReports: [...relatedReports].sort(),
  };
};

const collectScopeBoundary = async (root, scopeId) => {
  const boundary = {
    features: new Set(),
    roadmaps: new Set(),
    specs: new Set(),
    campaigns: new Set(),
    runs: new Set(),
  };
  addBoundaryId(boundary, normalizeBoundaryRef(scopeId));

  const scanCampaigns = async () => {
    let changed = false;
    const knownIds = boundaryIds(boundary);
    for (const campaignDir of await listDirectories(root, 'ops/execution/campaigns')) {
      if (path.basename(campaignDir) === 'archived') continue;
      const campaignId = path.basename(campaignDir);
      const content = await readOptionalText(root, `${campaignDir}/plan.md`);
      if (!content) continue;
      if (!boundary.campaigns.has(campaignId) && campaignId !== scopeId && !hasBoundaryIntersection(scopeId, knownIds, content)) {
        continue;
      }
      const before = boundaryIds(boundary).size;
      boundary.campaigns.add(campaignId);
      absorbLinkedIds(boundary, content);
      changed = changed || boundaryIds(boundary).size !== before;
    }
    return changed;
  };

  const scanRuns = async () => {
    let changed = false;
    const knownIds = boundaryIds(boundary);
    for (const runDir of await listDirectories(root, 'ops/execution/runs')) {
      if (path.basename(runDir) === 'archived') continue;
      const runId = path.basename(runDir);
      const plan = await readOptionalText(root, `${runDir}/plan.md`);
      const state = await readOptionalText(root, `${runDir}/state.md`);
      const content = [plan, state].filter(Boolean).join('\n');
      if (!content) continue;
      if (!boundary.runs.has(runId) && runId !== scopeId && !hasBoundaryIntersection(scopeId, knownIds, content)) {
        continue;
      }
      const before = boundaryIds(boundary).size;
      boundary.runs.add(runId);
      absorbLinkedIds(boundary, content);
      changed = changed || boundaryIds(boundary).size !== before;
    }
    return changed;
  };

  for (let index = 0; index < 4; index += 1) {
    const campaignChanged = await scanCampaigns();
    const runChanged = await scanRuns();
    const changed = campaignChanged || runChanged;
    if (!changed) break;
  }

  return boundary;
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

const writeLogEvent = async (root, { eventType, summary, sourceCampaign = '', sourceRun = '', relatedEvidence = '' }) => {
  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const relPath = `ops/evidence/logs/log_${timestampForFile(now)}_${slugify(eventType)}.md`;
  await writeText(root, relPath, logEventTemplate({
    now,
    eventType,
    summary,
    sourceCampaign,
    sourceRun,
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
    sourceCampaign: args.sourceCampaign,
    sourceRun: args.sourceRun,
    relatedEvidence: args.relatedEvidence,
  });
};

const addIdeal = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for ideal add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  if (!/^i[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(args.idealId)) {
    throw new Error('Ideal id must match iNNN-lowercase-kebab-case');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd ideal add <id> --summary <text>');
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const relPath = `product/ideal/${args.idealId}.md`;
  await writeText(root, relPath, idealFileTemplate({
    idealId: args.idealId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'ideal-add',
    summary: `Added ideal ${args.idealId}`,
    relatedEvidence: relPath,
  });

  return { root, idealId: args.idealId, idealPath: relPath, written: created.written, skipped: created.skipped };
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
  if (!/^f[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(args.featureId)) {
    throw new Error('Feature id must match fNNN-lowercase-kebab-case');
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
  if (!/^r[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(args.roadmapId)) {
    throw new Error('Roadmap id must match rNNN-lowercase-kebab-case');
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
  if (!/^s[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(args.specId)) {
    throw new Error('Spec id must match sNNN-lowercase-kebab-case');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd spec add <id> --summary <text>');
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const specRoot = `product/specs/${args.specId}`;
  await writeText(root, `${specRoot}/spec.md`, specTemplate({
    specId: args.specId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);
  await writeText(root, `${specRoot}/plan.md`, specPlanTemplate({
    specId: args.specId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);
  await writeText(root, `${specRoot}/research.md`, specResearchTemplate({
    specId: args.specId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);
  await writeText(root, `${specRoot}/data-model.md`, specDataModelTemplate({
    specId: args.specId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);
  await writeText(root, `${specRoot}/contracts/README.md`, specContractsTemplate({
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

const addReference = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for reference add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  if (slugify(args.referenceId) !== args.referenceId) {
    throw new Error('Reference id must be lowercase kebab-case ASCII');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd reference add historical|external|note <id> --summary <text>');
  }
  const kindDirs = {
    historical: 'reference/historical-documents',
    external: 'reference/external',
    note: 'reference/notes',
  };
  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const relPath = `${kindDirs[args.referenceKind]}/${args.referenceId}.md`;
  await writeText(root, relPath, referenceFileTemplate({
    referenceKind: args.referenceKind,
    referenceId: args.referenceId,
    summary: args.eventSummary,
    now,
  }), { ...args, force: false }, created);

  await updateTextFile(root, 'reference/INDEX.md', (content) => {
    const row = `- ${relPath}: ${args.eventSummary}`;
    if (content.includes(row)) return content;
    return appendSection(content.replace(/\n+$/, '\n'), `${row}\n`);
  }, args, created);

  await writeLogEvent(root, {
    eventType: 'reference-add',
    summary: `Added reference ${args.referenceId}`,
    relatedEvidence: relPath,
  });

  return { root, referenceId: args.referenceId, referencePath: relPath, written: created.written, skipped: created.skipped };
};

const addCampaign = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for campaign add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  const campaignId = args.campaignId;
  if (!/^c[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(campaignId)) {
    throw new Error('Campaign id must match cNNN-lowercase-kebab-case');
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd campaign add <id> --summary <text> --roadmap <ref>');
  }
  if (!args.linkedRoadmap) {
    throw new Error('Usage: cc-iasd campaign add <id> --summary <text> --roadmap <ref>');
  }
  await validateLinkedArgs(root, args);

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const campaignRoot = `ops/execution/campaigns/${campaignId}`;
  await writeText(root, `${campaignRoot}/plan.md`, campaignPlanTemplate({
    campaignId,
    summary: args.eventSummary,
    now,
    linkedFeature: args.linkedFeature,
    linkedRoadmap: args.linkedRoadmap,
    linkedSpec: args.linkedSpec,
    linkedTasks: args.linkedTasks,
  }), { ...args, force: false }, created);
  await writeText(root, `${campaignRoot}/state.md`, campaignStateTemplate({ campaignId, now }), { ...args, force: false }, created);
  await writeText(root, `${campaignRoot}/queue.md`, campaignQueueTemplate({ campaignId }), { ...args, force: false }, created);
  await writeText(root, `${campaignRoot}/aggregate-report.md`, campaignAggregateReportTemplate({ campaignId, now }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'campaign-add',
    summary: `Added campaign ${campaignId}`,
    sourceCampaign: campaignId,
    relatedEvidence: `${campaignRoot}/plan.md`,
  });

  return { root, campaignId, campaignRoot, written: created.written, skipped: created.skipped };
};

const markCampaignRunCommand = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for campaign mark-run.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  const allowed = ['completed', 'blocked', 'escalated', 'deferred'];
  if (!allowed.includes(args.status)) {
    throw new Error(`Campaign run status must be one of: ${allowed.join(', ')}`);
  }
  ensureRunId(args.scopeId);
  const created = { written: [], skipped: [] };
  await markCampaignRun(root, {
    campaignId: args.campaignId,
    runId: args.scopeId,
    status: args.status,
  }, args, created);
  await updateRunResult(root, args.scopeId, args.status, args, created);
  await updateCampaignResultFromQueue(root, args.campaignId, args, created);
  await writeLogEvent(root, {
    eventType: 'campaign-mark-run',
    summary: `Marked ${args.scopeId} as ${args.status} in ${args.campaignId}`,
    sourceCampaign: args.campaignId,
    sourceRun: args.scopeId,
    relatedEvidence: `ops/execution/campaigns/${args.campaignId}/queue.md`,
  });
  return { root, campaignId: args.campaignId, runId: args.scopeId, status: args.status, written: created.written, skipped: created.skipped };
};

const appendCampaignRun = async (root, { campaignId, runId, sourceId, linkedTasks }, args, created) => {
  if (!campaignId) return;
  const queuePath = `ops/execution/campaigns/${campaignId}/queue.md`;
  if (!await exists(path.join(root, queuePath))) return;
  await updateTextFile(root, queuePath, (content) => {
    if (content.includes(`| ${runId} |`)) return content;
    const rows = content.split('\n').filter((line) => /^\| [0-9]+ \|/.test(line));
    const order = rows.length + 1;
    const nextRow = `| ${order} | ${sourceId} | ${linkedTasks || 'TBD'} | running | ${runId} |`;
    return appendSection(content.replace(/\n+$/, '\n'), `${nextRow}\n`);
  }, args, created);
};

const markCampaignRun = async (root, { campaignId, runId, status }, args, created) => {
  const queuePath = `ops/execution/campaigns/${campaignId}/queue.md`;
  if (!await exists(path.join(root, queuePath))) {
    throw new Error(`Campaign queue does not exist: ${queuePath}`);
  }
  await updateTextFile(root, queuePath, (content) => {
    const lines = content.split('\n');
    const index = lines.findIndex((line) => line.includes(`| ${runId} |`));
    if (index === -1) {
      throw new Error(`Run is not registered in campaign queue: ${runId}`);
    }
    const cells = lines[index].split('|').map((cell) => cell.trim());
    lines[index] = `| ${cells[1]} | ${cells[2]} | ${cells[3]} | ${status} | ${cells[5]} |`;
    return lines.join('\n');
  }, args, created);
};

const updateCampaignResultFromQueue = async (root, campaignId, args, created) => {
  const queuePath = `ops/execution/campaigns/${campaignId}/queue.md`;
  const statePath = `ops/execution/campaigns/${campaignId}/state.md`;
  const queue = await readOptionalText(root, queuePath);
  if (!queue || !await exists(path.join(root, statePath))) return;

  const statuses = queue
    .split('\n')
    .filter((line) => /^\| [0-9]+ \|/.test(line))
    .map((line) => line.split('|').map((cell) => cell.trim())[4])
    .filter(Boolean);

  const result = (() => {
    if (!statuses.length) return 'in-progress';
    if (statuses.every((status) => status === 'completed')) return 'completed';
    if (statuses.includes('blocked')) return 'blocked';
    if (statuses.includes('escalated')) return 'escalated';
    if (statuses.includes('deferred') && statuses.every((status) => status === 'completed' || status === 'deferred')) return 'deferred';
    return 'in-progress';
  })();

  const activeBlocker = ['blocked', 'escalated'].includes(result)
    ? 'See campaign queue for blocked or escalated run.'
    : 'none recorded';
  const now = new Date().toISOString();

  await updateTextFile(root, statePath, (content) => {
    let next = replaceLine(content, '- Result:', `- Result: ${result}`);
    next = replaceLine(next, '- Active Blocker:', `- Active Blocker: ${activeBlocker}`);
    next = replaceLine(next, '- Last Update:', `- Last Update: ${now}`);
    return next;
  }, args, created);
};

const updateRunResult = async (root, runId, result, args, created) => {
  const statePath = `ops/execution/runs/${runId}/state.md`;
  if (!await exists(path.join(root, statePath))) return;
  const now = new Date().toISOString();
  await updateTextFile(root, statePath, (content) => {
    let next = replaceLine(content, '- Result:', `- Result: ${result}`);
    next = replaceLine(next, '- Last Update:', `- Last Update: ${now}`);
    return next;
  }, args, created);
};

const addOpenItem = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for open item add.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  const runId = args.scopeId;
  ensureRunId(runId);
  if (!openItemKindValues.includes(args.openItemKind)) {
    throw new Error(`Open item kind must be one of: ${openItemKindValues.join(', ')}`);
  }
  if (!args.eventSummary) {
    throw new Error('Usage: cc-iasd open-item add <run-id> --kind <kind> --summary <text>');
  }

  const openItemsPath = `ops/execution/runs/${runId}/open-items.md`;
  const current = await readOptionalText(root, openItemsPath);
  if (!current) {
    throw new Error(`Run open items file does not exist: ${openItemsPath}`);
  }
  const itemId = nextOpenItemId(current);
  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  await updateTextFile(root, openItemsPath, (content) => {
    const withoutNone = content.replace(/## Items\n\n- None\n?/m, '## Items\n\n');
    return appendSection(withoutNone.replace(/\n+$/, '\n'), `${openItemEntryTemplate({
      itemId,
      runId,
      kind: args.openItemKind,
      summary: args.eventSummary,
      targetRef: args.targetRef,
      now,
    })}\n`);
  }, args, created);

  await writeLogEvent(root, {
    eventType: 'open-item-add',
    summary: `Added open item ${itemId} for ${runId}`,
    sourceRun: runId,
    relatedEvidence: openItemsPath,
  });

  return { root, runId, itemId, openItemsPath, written: created.written, skipped: created.skipped };
};

const resolveOpenItem = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for open item resolve.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }
  const runId = args.scopeId;
  ensureRunId(runId);
  if (!openItemStatusValues.includes(args.resolution) || args.resolution === 'open') {
    throw new Error('Resolution must be resolved, escalated, promoted, or deferred');
  }
  if (!/^oi-[0-9]{3}$/.test(args.openItemId)) {
    throw new Error('Open item id must match oi-NNN');
  }

  const openItemsPath = `ops/execution/runs/${runId}/open-items.md`;
  const current = await readOptionalText(root, openItemsPath);
  if (!current.includes(`- ID: ${args.openItemId}`)) {
    throw new Error(`Open item does not exist: ${args.openItemId}`);
  }
  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  await updateTextFile(root, openItemsPath, (content) => {
    const start = content.indexOf(`### ${args.openItemId}`);
    const end = content.indexOf('\n### ', start + 1);
    const before = content.slice(0, start);
    const section = content.slice(start, end === -1 ? undefined : end);
    const after = end === -1 ? '' : content.slice(end);
    let nextSection = replaceLine(section, '- Status:', `- Status: ${args.resolution}`);
    nextSection = replaceLine(nextSection, '- Resolution:', `- Resolution: ${args.eventSummary || args.resolution}`);
    nextSection = replaceLine(nextSection, '- Updated At:', `- Updated At: ${now}`);
    if (args.targetRef) {
      nextSection = replaceLine(nextSection, '- Target:', `- Target: ${args.targetRef}`);
    }
    return `${before}${nextSection}${after}`;
  }, args, created);

  await writeLogEvent(root, {
    eventType: 'open-item-resolve',
    summary: `Resolved open item ${args.openItemId} for ${runId} as ${args.resolution}`,
    sourceRun: runId,
    relatedEvidence: openItemsPath,
  });

  return { root, runId, itemId: args.openItemId, resolution: args.resolution, openItemsPath, written: created.written, skipped: created.skipped };
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

  const scopeId = args.scopeId;
  if (!/^(run_[0-9]{17}_[a-z0-9][a-z0-9-]*|[a-z][0-9]{3}-[a-z0-9][a-z0-9-]*|[a-z0-9][a-z0-9-]*)$/.test(scopeId)) {
    throw new Error('Scope id must be a run id, numbered artifact id, or lowercase kebab-case ASCII');
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const reviewPath = `ops/evidence/reviews/review_${timestampForFile(now)}_${slugify(args.eventSummary)}.md`;
  await writeText(root, reviewPath, reviewRecordTemplate({
    scopeId,
    now,
    reviewType: args.eventType,
    reviewMode: args.reviewMode,
    summary: args.eventSummary,
    result: args.reviewResult,
    reviewer: args.reviewer,
    baseCommit: args.baseCommit,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'review-add',
    summary: `Added ${args.eventType} review for ${scopeId}`,
    sourceRun: scopeId.startsWith('run_') ? scopeId : '',
    sourceCampaign: scopeId.startsWith('c') ? scopeId : '',
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

  const runDirs = (await listDirectories(root, 'ops/execution/runs')).filter((item) => path.basename(item) !== 'archived');
  const entries = [];
  for (const runDir of runDirs) {
    const scopeId = path.basename(runDir);
    const runs = (await listRunStateEntries(root, scopeId)).map((entry) => entry.path);
    const reviews = await listReviewFilesForScope(root, scopeId);
    const reports = await listReportFilesForScope(root, scopeId);
    entries.push({
      scopeId,
      scope: `${runDir}/state.md`,
      runs,
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
  const campaigns = (await listDirectories(root, 'ops/execution/campaigns')).filter((item) => path.basename(item) !== 'archived');
  const runs = (await listDirectories(root, 'ops/execution/runs')).filter((item) => path.basename(item) !== 'archived');
  const logs = latest(await listMarkdownFiles(root, 'ops/evidence/logs'), 5);
  const reviews = latest(await listMarkdownFiles(root, 'ops/evidence/reviews'), 5);
  const reports = latest(await listMarkdownFiles(root, 'ops/evidence/reports'), 5);
  const now = new Date().toISOString();
  return { root, view: currentViewTemplate({ now, ideals, specs, features, roadmaps, campaigns, runs, logs, reviews, reports }) };
};

const viewScope = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for scope view generation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  assertArchiveId(args.viewId);
  const scopeId = args.viewId;
  const boundary = await collectScopeBoundary(root, scopeId);
  const boundaryList = toBoundaryList(boundary);
  const sections = await readExistingSections(root, [
    ...boundaryList.features.map((id) => ['Feature Scope', `ops/scopes/features/${id}.md`]),
    ...boundaryList.roadmaps.map((id) => ['Roadmap Scope', `ops/scopes/roadmaps/${id}.md`]),
    ...boundaryList.specs.flatMap((id) => [
      ['Spec', `product/specs/${id}/spec.md`],
      ['Spec Plan', `product/specs/${id}/plan.md`],
      ['Spec Tasks', `product/specs/${id}/tasks.md`],
    ]),
    ...boundaryList.campaigns.flatMap((id) => [
      ['Campaign Plan', `ops/execution/campaigns/${id}/plan.md`],
      ['Campaign State', `ops/execution/campaigns/${id}/state.md`],
      ['Campaign Queue', `ops/execution/campaigns/${id}/queue.md`],
      ['Campaign Aggregate Report', `ops/execution/campaigns/${id}/aggregate-report.md`],
    ]),
    ...boundaryList.runs.flatMap((id) => [
      ['Run Plan', `ops/execution/runs/${id}/plan.md`],
      ['Run State', `ops/execution/runs/${id}/state.md`],
      ['Run Open Items', `ops/execution/runs/${id}/open-items.md`],
    ]),
  ]);
  const { relatedRuns, relatedReviews, relatedReports } = await collectBoundaryEvidence(root, boundary);
  const now = new Date().toISOString();
  return { root, view: scopeViewTemplate({ now, scopeId, boundary: boundaryList, sections, relatedRuns, relatedReviews, relatedReports }) };
};

const viewRun = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for run view generation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  assertArchiveId(args.viewId);
  const runId = args.viewId;
  const runRoot = `ops/execution/runs/${runId}`;
  const sections = await readExistingSections(root, [
    ['Plan', `${runRoot}/plan.md`],
    ['Handoff', `${runRoot}/handoff.md`],
    ['State', `${runRoot}/state.md`],
    ['Open Items', `${runRoot}/open-items.md`],
    ['Knowledge', `${runRoot}/knowledge.md`],
  ]);
  const now = new Date().toISOString();
  return { root, view: runViewTemplate({ now, runId, sections }) };
};

const viewContext = async (args) => {
  if (args.runTarget === 'evidence') return viewEvidence(args);
  if (args.runTarget === 'current') return viewCurrent(args);
  if (args.runTarget === 'scope') return viewScope(args);
  if (args.runTarget === 'run') return viewRun(args);
  throw new Error('Usage: cc-iasd view evidence|current|scope|run');
};

const runStart = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for run start.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const sourceId = args.runSourceId;
  if (slugify(sourceId) !== sourceId) {
    throw new Error('Run source id must be lowercase kebab-case ASCII');
  }

  const campaignPlanPath = `ops/execution/campaigns/${sourceId}/plan.md`;
  const specPath = `product/specs/${sourceId}/spec.md`;
  const roadmapPath = `ops/scopes/roadmaps/${sourceId}.md`;
  const sourcePath = await resolveExistingPath(root, [campaignPlanPath, specPath, roadmapPath]);
  if (!sourcePath) {
    throw new Error(`Run source does not exist: ${sourceId}`);
  }

  const now = new Date().toISOString();
  const runId = `run_${timestampForFile(now)}_${sourceId}`;
  const runRoot = `ops/execution/runs/${runId}`;
  const created = { written: [], skipped: [] };
  const sourceContent = await readOptionalText(root, sourcePath);
  const linkedCampaign = sourcePath.startsWith('ops/execution/campaigns/') ? sourceId : args.sourceCampaign;
  const linkedFeature = args.linkedFeature || extractField(sourceContent, 'Linked Feature');
  const linkedRoadmap = args.linkedRoadmap || extractField(sourceContent, 'Linked Roadmap') || (sourcePath.startsWith('ops/scopes/roadmaps/') ? sourceId : '');
  const linkedSpec = args.linkedSpec || extractField(sourceContent, 'Linked Spec') || (sourcePath.startsWith('product/specs/') ? sourceId : '');
  const linkedTasks = args.linkedTasks || extractField(sourceContent, 'Linked Tasks') || linkedSpec;

  await writeText(root, `${runRoot}/plan.md`, runPlanTemplate({ runId, sourceId, now, linkedFeature, linkedRoadmap, linkedCampaign, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${runRoot}/handoff.md`, runHandoffTemplate({ runId, sourceId, linkedFeature, linkedRoadmap, linkedCampaign, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${runRoot}/state.md`, runStateTemplate({ runId, sourceId, now, linkedFeature, linkedRoadmap, linkedCampaign, linkedSpec, linkedTasks }), { ...args, force: false }, created);

  await writeText(root, `${runRoot}/open-items.md`, runOpenItemsTemplate({ runId }), { ...args, force: false }, created);

  await writeText(root, `${runRoot}/knowledge.md`, runKnowledgeTemplate({ runId, now }), { ...args, force: false }, created);

  await appendCampaignRun(root, {
    campaignId: linkedCampaign,
    runId,
    sourceId,
    linkedTasks,
  }, args, created);

  await writeLogEvent(root, {
    eventType: 'run',
    summary: `Prepared run ${runId} from ${sourceId}`,
    sourceCampaign: linkedCampaign,
    sourceRun: runId,
    relatedEvidence: `${runRoot}/state.md`,
  });

  return { root, sourceId, runId, written: created.written, skipped: created.skipped };
};

const reportScope = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for report.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const scopeId = args.scopeId;
  const scopePath = await resolveExistingPath(root, [
    `ops/execution/runs/${scopeId}/state.md`,
    `ops/execution/campaigns/${scopeId}/state.md`,
    `ops/scopes/roadmaps/${scopeId}.md`,
    `ops/scopes/features/${scopeId}.md`,
    `product/specs/${scopeId}/spec.md`,
  ]);
  if (!scopePath) {
    throw new Error(`Scope does not exist: ${scopeId}`);
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const runStates = await listRunStateEntries(root, scopeId);
  const reviewFiles = await listReviewFilesForScope(root, scopeId);
  const reportFiles = await listReportFilesForScope(root, scopeId);
  const reportPath = `ops/evidence/reports/report_${timestampForFile(now)}_${scopeId}.md`;

  await writeText(root, reportPath, completionReportTemplate({
    scopeId,
    scopePath,
    now,
    runStates,
    reviewFiles,
    reportFiles,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'report',
    summary: `Prepared completion report for ${scopeId}`,
    sourceRun: scopePath.startsWith('ops/execution/runs/') ? scopeId : '',
    sourceCampaign: scopePath.startsWith('ops/execution/campaigns/') ? scopeId : '',
    relatedEvidence: reportPath,
  });

  return { root, scopeId, reportPath, written: created.written, skipped: created.skipped };
};

const escalateScope = async (args) => {
  const root = path.resolve(process.cwd(), args.target);
  const doctorResult = await doctor({ ...args, target: root });
  if (doctorResult.issues.length) {
    throw new Error(`Project-context is not ready for escalation.\n${doctorResult.issues.map((issue) => `- ${issue}`).join('\n')}`);
  }

  const scopeId = args.scopeId;
  const scopePath = await resolveExistingPath(root, [
    `ops/execution/runs/${scopeId}/state.md`,
    `ops/execution/campaigns/${scopeId}/state.md`,
    `ops/scopes/roadmaps/${scopeId}.md`,
    `ops/scopes/features/${scopeId}.md`,
    `product/specs/${scopeId}/spec.md`,
  ]);
  if (!scopePath) {
    throw new Error(`Scope does not exist: ${scopeId}`);
  }

  const now = new Date().toISOString();
  const created = { written: [], skipped: [] };
  const scopeContent = await readOptionalText(root, scopePath);
  const runStates = await listRunStateEntries(root, scopeId);
  const latestRunState = runStates.at(-1)?.content || scopeContent;
  const activeBlocker = extractField(latestRunState, 'Active Blocker');
  const linkedSpec = extractField(scopeContent, 'Linked Spec') || extractField(latestRunState, 'Linked Spec');
  const linkedTasks = extractField(scopeContent, 'Linked Tasks') || extractField(latestRunState, 'Linked Tasks');
  const reportPath = `ops/evidence/reports/escalation_${timestampForFile(now)}_${scopeId}.md`;

  await writeText(root, reportPath, escalationTemplate({
    scopeId,
    now,
    scopeContent,
    runStates,
    activeBlocker,
    linkedSpec,
    linkedTasks,
  }), { ...args, force: false }, created);

  await writeLogEvent(root, {
    eventType: 'escalate',
    summary: `Prepared escalation packet for ${scopeId}`,
    sourceRun: scopePath.startsWith('ops/execution/runs/') ? scopeId : '',
    sourceCampaign: scopePath.startsWith('ops/execution/campaigns/') ? scopeId : '',
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
    campaign: [`ops/execution/campaigns/${args.archiveId}`, `ops/execution/campaigns/archived/${args.archiveId}`],
    run: [`ops/execution/runs/${args.archiveId}`, `ops/execution/runs/archived/${args.archiveId}`],
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
    'execution_root: ops/execution',
    'campaigns_root: ops/execution/campaigns',
    'runs_root: ops/execution/runs',
    'evidence_root: ops/evidence',
    'reference_root: reference',
    '',
  ].join('\n'), args, created);

  await writeText(root, 'runtime/lock.json', `${JSON.stringify({
    cc_iasd_version: VERSION,
    created_at: now,
    spec_kernel: 'spec-kit-compatible',
    implementation_runtime: 'runtime-compatible',
    src_root: 'src',
    product_root: 'product',
    specs_root: 'product/specs',
    scopes_root: 'ops/scopes',
    execution_root: 'ops/execution',
    campaigns_root: 'ops/execution/campaigns',
    runs_root: 'ops/execution/runs',
    evidence_root: 'ops/evidence',
    profile: 'default',
  }, null, 2)}\n`, args, created);

  await copyTree(root, path.join(packageRoot, 'rules'), 'rules/policies', args, created, variables);
  await copyTree(root, path.join(packageRoot, 'roles'), 'rules/roles', args, created, variables);
  await copyTopLevelFiles(root, path.join(packageRoot, 'templates'), 'rules/templates', args, created);
  await writeRuntimeProfileFiles(root, args, created);

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
    '## Source Projects',
    '',
    'Define every source project under `src/` here. cc-iasd does not define Git management policy, but it must know which source project is the primary implementation target when multiple repositories exist.',
    '',
    '- Primary Project ID: TBD',
    '- Primary Project Path: src/',
    '- Additional Projects: none',
    '',
    '### Project Entry Schema',
    '',
    '- Project ID: lowercase-kebab-case',
    '- Path: src/<repository-or-alias>',
    '- Role: primary / service / library / tool / docs / infra',
    '- Runtime: TBD',
    '- Test Command: TBD',
    '- Build Command: TBD',
    '- Notes: TBD',
    '',
    'Do not place cc-iasd-managed specs, runtime state, runs, evidence, reports, or policies inside these source projects.',
    '',
    '## Artifact Creation Authority',
    '',
    '- AI agents may create and edit files under `src/` as normal implementation output.',
    '- AI agents must not directly create, move, rename, archive, outdate, or delete files under `product/`, `ops/`, `rules/`, `runtime/`, `user/`, or `reference/`.',
    '- New cc-iasd-managed artifacts must be created by `cc-iasd` commands or explicit human file operations.',
    '- AI agents may edit authored content sections inside command-created artifacts.',
    '- Tool-owned metadata, IDs, lifecycle state, source references, archive placement, and outdate placement must be updated by `cc-iasd` commands or explicit human file operations.',
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
    'Product canon for normalized ideal artifacts. Active ideal files use `iNNN-kebab-case.md`. Files in `outdated/` are no longer current product canon.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'product/ideal/outdated/README.md', [
    '# Outdated Ideal',
    '',
    'Ideal artifacts that no longer hold product canon status. Preserve the original `iNNN-kebab-case.md` file name when moving an ideal here.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'product/specs/README.md', [
    '# Specs',
    '',
    'cc-iasd-owned specs live here using a Spec Kit compatible artifact vocabulary.',
    '',
    'Do not place cc-iasd-managed specs under `src/`.',
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
  await writeText(root, 'ops/execution/campaigns/README.md', [
    '# Campaigns',
    '',
    'Campaign artifacts coordinate multiple runs through task selectors, stop conditions, and progression conditions.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/execution/campaigns/archived/README.md', '# Archived Campaigns\n', args, created);

  await writeText(root, 'ops/execution/runs/README.md', [
    '# Runs',
    '',
    'Run artifacts track autonomous execution task selection, runtime context, handoff, state, open items, and run-local knowledge.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/execution/runs/archived/README.md', '# Archived Runs\n', args, created);

  await writeText(root, 'ops/evidence/logs/README.md', [
    '# Logs',
    '',
    'Global chronological work log. Archived logs move to `archived/`.',
    '',
  ].join('\n'), args, created);
  await writeText(root, 'ops/evidence/logs/archived/README.md', '# Archived Logs\n', args, created);
  await writeText(root, 'ops/evidence/reviews/README.md', [
    '# Reviews',
    '',
    'Scope-crossing review evidence. Product, scope, and execution artifacts refer to review IDs or paths.',
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
    'Do not place cc-iasd-managed specs, runtime files, run state, evidence, reports, or policies under `src/`.',
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
    '- `ops/`: scopes, execution, and evidence',
    '- `reference/`: non-canonical reference material',
    '- `runtime/`: cc-iasd runtime configuration and generated adapters',
    '- `src/`: source project root',
    '',
    '## Required Reading',
    '',
    '- `rules/policies/AI_RUNTIME_RULES.md`',
    '- `rules/project-policies.md`',
    '',
    '## Artifact Rules',
    '',
    '- `src/` is the normal implementation area. AI agents may create and edit source project files under `src/`.',
    '- Do not directly create, move, rename, archive, outdate, or delete cc-iasd-managed files under `product/`, `ops/`, `rules/`, `runtime/`, `user/`, or `reference/`.',
    '- Use `cc-iasd` commands or explicit human file operations to create new cc-iasd-managed artifacts.',
    '- After a command creates an artifact, AI agents may edit its authored content sections, but must not free-edit tool-owned metadata, IDs, lifecycle state, source references, archive placement, or outdate placement.',
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
    const result = await runStart(args);
    console.log(`Prepared run ${result.runId} from ${result.sourceId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Run start does not overwrite existing run records.`);
    }
  } else if (args.command === 'escalate') {
    const result = await escalateScope(args);
    console.log(`Prepared escalation packet for scope ${result.scopeId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Escalate does not overwrite report records.`);
    }
  } else if (args.command === 'report') {
    const result = await reportScope(args);
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
  } else if (args.command === 'open-item') {
    const result = args.runTarget === 'add' ? await addOpenItem(args) : await resolveOpenItem(args);
    console.log(`${args.runTarget === 'add' ? 'Added' : 'Resolved'} open item ${result.itemId} for run ${result.runId} in ${result.root}.`);
    console.log(`Updated ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} unchanged file(s).`);
    }
  } else if (args.command === 'ideal') {
    const result = await addIdeal(args);
    console.log(`Prepared ideal ${result.idealId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Ideal add does not overwrite ideal records.`);
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
  } else if (args.command === 'campaign') {
    const result = args.runTarget === 'add' ? await addCampaign(args) : await markCampaignRunCommand(args);
    if (args.runTarget === 'add') {
      console.log(`Prepared campaign ${result.campaignId} in ${result.root}.`);
      console.log(`Created ${result.written.length} file(s).`);
      if (result.skipped.length) {
        console.log(`Skipped ${result.skipped.length} existing file(s). Campaign add does not overwrite campaign records.`);
      }
    } else {
      console.log(`Marked run ${result.runId} as ${result.status} in campaign ${result.campaignId}.`);
      console.log(`Updated ${result.written.length} file(s).`);
    }
  } else if (args.command === 'spec') {
    const result = await addSpec(args);
    console.log(`Prepared spec ${result.specId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Spec add does not overwrite spec records.`);
    }
  } else if (args.command === 'reference') {
    const result = await addReference(args);
    console.log(`Prepared reference ${result.referenceId} in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Reference add does not overwrite reference records.`);
    }
  } else if (args.command === 'profile') {
    const result = await updateProfile(args);
    console.log(`Updated runtime profile in ${result.root}.`);
    console.log(`Created ${result.written.length} file(s).`);
    if (result.skipped.length) {
      console.log(`Skipped ${result.skipped.length} existing file(s). Use --force to regenerate runtime profile files.`);
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
