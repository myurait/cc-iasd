English | [日本語](README.ja.md)

# cc-iasd

cc-iasd is a project-context framework for governed agentic software development.

It does not replace coding agents such as Codex or Claude Code. It creates the project-context around them: constraints, user input, ideal state, features, roadmaps, specs, execution campaigns, runs, logs, evidence, escalation packets, and completion reports.

## Execution Harness Purpose

cc-iasd is an execution harness for turning human intent into bounded agent work.

It exists to keep autonomous implementation from drifting away from the product intent. Before work reaches a run, cc-iasd should make the intended user experience, expected feature coverage, priority, implementation scope, impact surfaces, and human-decision points explicit enough for an AI agent to act without inventing a different product.

The harness is designed to:

- prevent agents from building functionality the user did not intend
- prevent expected functionality from being lost during task breakdown
- preserve feature priority across ideal, feature, spec, campaign, and run artifacts
- define expected touched surfaces and related impact surfaces before execution
- return infrastructure, cost, security, and product-value decisions to a human early
- make each run small and strict enough to verify
- keep direct user-experience impact grouped at the campaign level

## Core Structure

```text
project-context/
  runtime/   # cc-iasd config, lock, adapters, generated runtime files
  rules/     # stable policies, roles, templates, checklists
  user/      # human-authored intent, constraints, decisions, preferences
  product/   # product canon such as ideal and specs
  ops/       # scopes, execution, and evidence
  reference/ # non-canonical reference material
  src/       # source project root, never cc-iasd runtime or spec storage
```

The main flow is:

```text
user input
  -> product/ideal
  -> ops/scopes/features
  -> ops/scopes/roadmaps
  -> product/specs
  -> ops/execution/campaigns
  -> ops/execution/runs
  -> ops/evidence
```

## Install

Use npx from a project-context root:

```bash
npx cc-iasd@latest init --doc-lang Japanese --dev-lang TypeScript
npx cc-iasd@latest doctor
npx cc-iasd@latest ideal add i001-core --summary "Core product ideal"
# Edit product/ideal/i001-core.md authored sections before continuing.
npx cc-iasd@latest feature add f001-feature-a --kind epic --summary "Add a core feature" --pillar "Core experience"
npx cc-iasd@latest roadmap add r001-first-roadmap --summary "First roadmap" --goal "Ship the first usable flow"
npx cc-iasd@latest spec add s001-first-slice --summary "Define the first implementation slice"
npx cc-iasd@latest campaign add c001-first-campaign --summary "First campaign" --feature f001-feature-a --roadmap r001-first-roadmap --spec s001-first-slice --tasks s001-first-slice
npx cc-iasd@latest run start c001-first-campaign
npx cc-iasd@latest help role worker
npx cc-iasd@latest open-item add <run-id> --kind follow-up --summary "Follow-up item"
npx cc-iasd@latest open-item resolve <run-id> oi-001 --resolution resolved --summary "Handled in this run"
npx cc-iasd@latest campaign mark-run c001-first-campaign <run-id> --status completed
npx cc-iasd@latest review add <run-id> --type light --summary "Review implementation result" --result "No blocking findings"
npx cc-iasd@latest escalate <run-id>
npx cc-iasd@latest report <run-id>
npx cc-iasd@latest reference add note planning-note --summary "Planning note"
npx cc-iasd@latest view evidence
npx cc-iasd@latest view current
npx cc-iasd@latest view run <run-id>
npx cc-iasd@latest log event --summary "Updated project context"
npx cc-iasd@latest product outdate spec s001-first-slice
npx cc-iasd@latest ops archive roadmap r001-first-roadmap
```

For local development from this repository:

```bash
node bin/cc-iasd.js init /tmp/my-project-context --doc-lang Japanese --dev-lang TypeScript
node bin/cc-iasd.js doctor /tmp/my-project-context
node bin/cc-iasd.js ideal add i001-core --summary "Core product ideal" --root /tmp/my-project-context
# Edit product/ideal/i001-core.md authored sections before continuing.
node bin/cc-iasd.js feature add f001-feature-a --kind epic --summary "Add a core feature" --pillar "Core experience" --root /tmp/my-project-context
node bin/cc-iasd.js roadmap add r001-first-roadmap --summary "First roadmap" --goal "Ship the first usable flow" --root /tmp/my-project-context
node bin/cc-iasd.js spec add s001-first-slice --summary "Define the first implementation slice" --root /tmp/my-project-context
node bin/cc-iasd.js campaign add c001-first-campaign --summary "First campaign" --feature f001-feature-a --roadmap r001-first-roadmap --spec s001-first-slice --tasks s001-first-slice --root /tmp/my-project-context
node bin/cc-iasd.js run start c001-first-campaign --root /tmp/my-project-context
node bin/cc-iasd.js help role worker --root /tmp/my-project-context
node bin/cc-iasd.js open-item add <run-id> --kind follow-up --summary "Follow-up item" --root /tmp/my-project-context
node bin/cc-iasd.js open-item resolve <run-id> oi-001 --resolution resolved --summary "Handled in this run" --root /tmp/my-project-context
node bin/cc-iasd.js campaign mark-run c001-first-campaign <run-id> --status completed --root /tmp/my-project-context
node bin/cc-iasd.js review add <run-id> --type light --summary "Review implementation result" --result "No blocking findings" --root /tmp/my-project-context
node bin/cc-iasd.js escalate <run-id> --root /tmp/my-project-context
node bin/cc-iasd.js report <run-id> --root /tmp/my-project-context
node bin/cc-iasd.js reference add note planning-note --summary "Planning note" --root /tmp/my-project-context
node bin/cc-iasd.js view evidence --root /tmp/my-project-context
node bin/cc-iasd.js view current --root /tmp/my-project-context
node bin/cc-iasd.js view run <run-id> --root /tmp/my-project-context
node bin/cc-iasd.js log event --summary "Updated project context" --root /tmp/my-project-context
node bin/cc-iasd.js product outdate spec s001-first-slice --root /tmp/my-project-context
node bin/cc-iasd.js ops archive roadmap r001-first-roadmap --root /tmp/my-project-context
```

## What `init` Creates

```text
runtime/
  cc-iasd.yaml
  lock.json
  profile.md
  plugins.yaml
  adapters/

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
  execution/
    campaigns/
      archived/
    runs/
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

## `src/` Usage

Place the source project under `src/`.

For a single repository, clone the target repository into `src/`, or alias an existing checkout to `src/`.

For multiple repositories, clone them side by side under `src/`.

```text
src/
  app-repository/
  api-repository/
  shared-library/
```

`src/` is a clean output boundary. cc-iasd-managed specs, runtime files, run state, evidence, reports, and policies must stay outside `src/`. cc-iasd may execute commands against source projects under `src/`, but it must not require cc-iasd-owned artifacts to live inside them.

AI agents may create and edit files under `src/`. Outside `src/`, new cc-iasd-managed artifacts are created by `cc-iasd` commands or explicit human file operations; AI agents then edit authored content sections inside those command-created artifacts.

## Current Status

The current npm CLI creates and validates the product / ops / reference structure, including ideal, feature, roadmap, spec, campaign, run, open item, review, report, escalation, log, view, reference, product outdate, and ops archive commands.

## License

MIT
