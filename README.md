English | [日本語](README.ja.md)

# cc-iasd

cc-iasd is a project-context framework for governed agentic software development.

It does not replace coding agents such as Codex, Claude Code, or cc-sdd. It creates the project-context around them: constraints, user input, ideal state, features, roadmaps, specs, milestones, logs, evidence, escalation packets, and completion reports.

## Core Structure

```text
project-context/
  runtime/   # cc-iasd config, lock, adapters, generated runtime files
  rules/     # stable policies, roles, templates, checklists
  user/      # human-authored intent, constraints, decisions, preferences
  ops/       # ideal, features, roadmaps, specs, milestones, logs, evidence, reports
  src/       # source project root
```

The main flow is:

```text
user input
  -> ops/ideal
  -> ops/features
  -> ops/roadmaps
  -> ops/specs
  -> ops/milestones
  -> evidence / escalation / completion report
```

## Install

Use npx from a project-context root:

```bash
npx cc-iasd@latest init --doc-lang Japanese --dev-lang TypeScript
```

For local development from this repository:

```bash
node bin/cc-iasd.js init /tmp/my-project-context --doc-lang Japanese --dev-lang TypeScript
```

## What `init` Creates

```text
runtime/
  cc-iasd.yaml
  lock.json

rules/
  policies/
  roles/
  templates/
  project-policies.md

user/
  product-intent.md
  constraints.md
  decisions.md
  preferences.md
  scratch.md

ops/
  ideal/
  features/
    index.md
    backlog.md
    epics/
    supporting/
  roadmaps/
  specs/
  milestones/
    project-context/
      reviews/
  logs/
  decisions.md
  evidence-index.md
  knowledge.md

src/
  README.md
```

## Current Status

This repository is in early migration from `myurait/ledger-flow`.

The current npm CLI supports project-context initialization. Additional commands for milestone run, escalation, reporting, and evidence maintenance are planned but not implemented yet.

## License

MIT
