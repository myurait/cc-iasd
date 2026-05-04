#!/usr/bin/env node
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';

const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const usage = `cc-iasd ${VERSION}

Usage:
  cc-iasd init [project-context-path] [options]
  cc-iasd --help

Options:
  --doc-lang <language>   Documentation language. Default: Japanese
  --dev-lang <language>   Development language. Default: unspecified
  --product-lang <lang>   Product language. Default: same as --doc-lang
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
  };

  const tokens = [...argv];
  if (tokens[0] && !tokens[0].startsWith('-')) {
    parsed.command = tokens.shift();
  }

  if (parsed.command !== 'init') {
    throw new Error(`Unknown command: ${parsed.command}`);
  }

  if (tokens[0] && !tokens[0].startsWith('-')) {
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
  await writeText(root, 'ops/roadmaps/README.md', '# Roadmaps\n', args, created);
  await writeText(root, 'ops/specs/README.md', '# Specs\n', args, created);
  await writeText(root, 'ops/milestones/README.md', '# Milestones\n', args, created);
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
    '- `ops/`: ideal, roadmaps, specs, milestones, evidence, and reports',
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
  const result = await init(args);
  console.log(`${args.dryRun ? 'Planned' : 'Created'} ${result.written.length} file(s).`);
  if (result.skipped.length) {
    console.log(`Skipped ${result.skipped.length} existing file(s). Use --force to overwrite.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error('');
  console.error(usage);
  process.exit(1);
}
