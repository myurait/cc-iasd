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
npx cc-iasd@latest doctor
npx cc-iasd@latest run milestone mvp-001 --feature feature-a --roadmap roadmap-a --spec spec-a --tasks spec-a
npx cc-iasd@latest escalate mvp-001
npx cc-iasd@latest report mvp-001
npx cc-iasd@latest index evidence
npx cc-iasd@latest log event --summary "Updated project context"
npx cc-iasd@latest feature add feature-a --kind epic --summary "Add a core feature" --pillar "Core experience"
```

For local development from this repository:

```bash
node bin/cc-iasd.js init /tmp/my-project-context --doc-lang Japanese --dev-lang TypeScript
node bin/cc-iasd.js doctor /tmp/my-project-context
node bin/cc-iasd.js run milestone mvp-001 --feature feature-a --roadmap roadmap-a --spec spec-a --tasks spec-a --root /tmp/my-project-context
node bin/cc-iasd.js escalate mvp-001 --root /tmp/my-project-context
node bin/cc-iasd.js report mvp-001 --root /tmp/my-project-context
node bin/cc-iasd.js index evidence --root /tmp/my-project-context
node bin/cc-iasd.js log event --summary "Updated project context" --root /tmp/my-project-context
node bin/cc-iasd.js feature add feature-a --kind epic --summary "Add a core feature" --pillar "Core experience" --root /tmp/my-project-context
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

The current npm CLI supports project-context initialization, structure validation, feature creation, minimal milestone handoff generation, escalation packet generation, completion report generation, evidence index generation, and global log event creation.

## License

MIT
