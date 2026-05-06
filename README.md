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
  product/   # product canon such as ideal and specs
  ops/       # scopes, cycles, and evidence
  reference/ # non-canonical reference material
  src/       # source project root
```

The main flow is:

```text
user input
  -> product/ideal
  -> ops/scopes/features
  -> ops/scopes/roadmaps
  -> product/specs
  -> ops/scopes/milestones
  -> ops/cycles
  -> ops/evidence
```

## Install

Use npx from a project-context root:

```bash
npx cc-iasd@latest init --doc-lang Japanese --dev-lang TypeScript
npx cc-iasd@latest doctor
npx cc-iasd@latest feature add feature-a --kind epic --summary "Add a core feature" --pillar "Core experience"
npx cc-iasd@latest roadmap add roadmap-a --summary "First roadmap" --goal "Ship the first usable flow"
npx cc-iasd@latest spec add spec-a --summary "Define the first implementation slice"
npx cc-iasd@latest milestone add milestone-a --summary "First milestone" --feature feature-a --roadmap roadmap-a --spec spec-a --tasks spec-a
npx cc-iasd@latest run cycle milestone-a
npx cc-iasd@latest review add milestone-a --type light --summary "Review implementation result" --result "No blocking findings"
npx cc-iasd@latest escalate milestone-a
npx cc-iasd@latest report milestone-a
npx cc-iasd@latest view evidence
npx cc-iasd@latest view current
npx cc-iasd@latest view scope milestone-a
npx cc-iasd@latest log event --summary "Updated project context"
npx cc-iasd@latest product outdate spec spec-a
npx cc-iasd@latest ops archive roadmap roadmap-a
```

For local development from this repository:

```bash
node bin/cc-iasd.js init /tmp/my-project-context --doc-lang Japanese --dev-lang TypeScript
node bin/cc-iasd.js doctor /tmp/my-project-context
node bin/cc-iasd.js feature add feature-a --kind epic --summary "Add a core feature" --pillar "Core experience" --root /tmp/my-project-context
node bin/cc-iasd.js roadmap add roadmap-a --summary "First roadmap" --goal "Ship the first usable flow" --root /tmp/my-project-context
node bin/cc-iasd.js spec add spec-a --summary "Define the first implementation slice" --root /tmp/my-project-context
node bin/cc-iasd.js milestone add milestone-a --summary "First milestone" --feature feature-a --roadmap roadmap-a --spec spec-a --tasks spec-a --root /tmp/my-project-context
node bin/cc-iasd.js run cycle milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js review add milestone-a --type light --summary "Review implementation result" --result "No blocking findings" --root /tmp/my-project-context
node bin/cc-iasd.js escalate milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js report milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js view evidence --root /tmp/my-project-context
node bin/cc-iasd.js view current --root /tmp/my-project-context
node bin/cc-iasd.js view scope milestone-a --root /tmp/my-project-context
node bin/cc-iasd.js log event --summary "Updated project context" --root /tmp/my-project-context
node bin/cc-iasd.js product outdate spec spec-a --root /tmp/my-project-context
node bin/cc-iasd.js ops archive roadmap roadmap-a --root /tmp/my-project-context
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
  scopes/
    features/
      archived/
    roadmaps/
      archived/
    milestones/
      archived/
  cycles/
    archived/
  evidence/
    logs/
      archived/
    reviews/
      archived/
    reports/
      archived/

reference/
  INDEX.md

src/
  README.md
```

## Current Status

This repository is in early migration from `myurait/ledger-flow`.

The current npm CLI creates and validates the new product / ops / reference structure, including feature, roadmap, spec, cycle, review, report, escalation, log, view, product outdate, and ops archive commands.

## License

MIT
