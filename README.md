English | [日本語](README.ja.md)

# cc-iasd

cc-iasd is a deterministic state-machine kernel and execution harness that enforces three invariants through structure rather than promises.

The three invariants it protects are:

```text
1. Treat src/ isolation as an absolute constraint
2. Evidence-first governance
3. No guess-filling -> structured upstream backtracking
```

Traditionally these were upheld by expectations written into role documents — "the worker does not guess," "never declare completion without evidence," "do not rewrite state on your own" — while the paths to break them stayed structurally open. cc-iasd does not leave these three conditions to LLM compliance; it enforces them in the CLI code and in the guards of a state machine. Lifecycle state lives only in an append-only journal, the only path to completion is the success of verification that the CLI itself ran, and there is structurally no actor that fills the gaps by guessing.

cc-iasd does not replace an implementation runtime such as Claude Code or Codex. The task implementation loop (editing code, running tests, producing diffs) is delegated to the runtime; from the outside, cc-iasd manages what to hand over (handoff), the scope within which the runtime may run autonomously (Surfaces / Checks), where to stop (stop conditions and the three terminal choices), what to keep as evidence, and what to return to human judgment (decision / escalation).

## The structure that upholds the three invariants

The three invariants are upheld not by expectation but by the following structure.

```text
Invariant 1 (src/ isolation):
  Every CLI write passes through a single write-path module, which rejects writes
  outside the allowlist of managed areas. A run declares its changed surfaces via
  Surfaces (write / forbid globs), and verify cross-checks the git diff from the
  base commit to mechanically detect deviation.

Invariant 2 (evidence-first governance):
  Any act that changes state is made identical to appending an event to the journal.
  There is no state change that bypasses the journal, and silent overwrite is
  structurally impossible. A verification is produced only when the CLI actually ran
  the check; an LLM's report that "the tests passed" is not an input to the guard.

Invariant 3 (no guess-filling):
  The handoff (a run's input) is not authored by the AI; the CLI mechanically
  synthesizes it from upstream artifacts. If something upstream is missing, the run
  does not start. A run terminates through only three choices — accept / block /
  escalate — and the state machine builds a cost gradient in which block, which
  returns the upstream shortfall, is the cheapest legal exit. Only the decide command
  can record a human ruling, and actor=human is stamped into the journal.
```

All of these are embedded in CLI guards. Nowhere in the flow is there a path for the AI to advance state or to fake completion without evidence.

## Relation to prior art

A survey of prior art in AI development frameworks (`docs/development/rework/01_prior_art_survey.md`) found strong precedents for individual building blocks — artifact chains, independent verification, rejection ladders, parallel runs — but no comparable prior art for the following three:

```text
1. Productizing src/ isolation (an inverted structure in which the project-context
   contains the artifact repo) together with an artifact schema and lifecycle
   management.
2. A tool that treats the escalation packet — an asynchronous decision document
   containing options, a recommendation, each option's impact, the impact of no
   action, and resume conditions — as a first-class concept.
3. A framework that formalizes the backtrack request — a bidirectional protocol
   that refuses guess-filling and returns the upstream shortfall in structured form.
```

cc-iasd implements these three as its own features and defers to prior art elsewhere. For details and the reference policy, see `docs/development/07_framework_integration.md`.

## Human intervention model

The human's role is "author and decision-maker," not "operator." The run-progression operations (open / return / verify / accept / review record, etc.) are executed by the agent; a state that cannot proceed unless a human learns a command vocabulary is treated as a design bug.

The steady-state motions a human needs to remember converge into a single sentence.

```text
When something catches your eye, cc-iasd; to answer, decide; to stop, STOP; to fix, Markdown.
```

- When something catches your eye, run `cc-iasd` (no arguments = inbox). It lists items that need attention, and you can run decide / campaign close right there.
- To answer, run `cc-iasd decide`. It records the human ruling on an escalation or a blocking gap (stamping actor=human into the journal).
- To stop, use the STOP file. It is mechanically evaluated as a run's stop condition (it is not even a command).
- To fix, edit Markdown. Directly edit authored content such as vision / spec / charter, version-controlled by git.

The ceiling of human-facing operations is this inbox / decide / STOP (plus Markdown editing and git). Adding any human-required operation beyond this is treated as a design bug. Knowledge of agent-facing commands is supplied in-band rather than learned in advance (baked into the handoff, offered as the next move in a guard's rejection message, and surfaced as available transitions by status).

## Your first run in 5 minutes

A full chain (vision -> spec -> campaign -> run) is not required from day one. The entry point is an adhoc run started from a goal a human wrote directly. An adhoc run bypasses the spec, but guard / journal / verify / the three terminal choices are all in effect, so the three invariants are upheld from day one.

```bash
# 1. Initialize the project-context (scaffold + journal + git init)
npx cc-iasd@latest init myapp
cd myapp

# 2. Place the artifact repo under src/ (example)
git clone git@github.com:me/app.git src/app

# 3. Open an adhoc run. The handoff is mechanically synthesized.
npx cc-iasd run open --adhoc "Fix the 500 returned on login failure" --check "npm test"

# 4. Hand the synthesized handoff to the implementation runtime.
npx cc-iasd run handoff <run-id> | claude
```

Example output of `init` (CLI output is shown with `doc_lang: Japanese`; messages follow the configured language):

```text
$ cc-iasd init myapp
project-context を初期化しました: /path/to/myapp
  doc_lang: Japanese / dev_lang: TypeScript
  初回 commit: 10901261d88a
次に打つコマンド:
  $ cc-iasd doctor
```

You can also see the guard pushing back. For example, if you open an adhoc run without `--check`, no transition happens and a rejection message is returned.

```text
$ cc-iasd run open --adhoc "goal だけ指定"
拒否: run open
欠けている入力:
  - adhoc.check: --check "<cmd>" が必要です（spike を除く）
次に打つコマンド:
  $ cc-iasd gap add <ref> / cc-iasd decide <id>（上流不足の解消）
  $ cc-iasd run block <run-id> --missing <ref>（差し戻し）
```

A rejection message always contains "which typed input is missing" and "the next command to run," and `--json` also returns a machine-readable form. Even without memorizing every precondition, an agent can get back on the right path just by following this next move.

## Layout of the project-context

The intended flat layout of a project-context is shown below. You clone your deliverable repos into `src/`, `state.json` is generated on derivation, and `init` creates everything else (details in `docs/development/03_project_context_architecture.md`).

```text
project-context/               # a git repo itself (version control of evidence; src/ is ignored)
  cc-iasd.yaml                 # the only config: runtime adapter / budgets / checks allowlist /
                               # decision policy / gate requirements / registered repos
  journal/                     # append-only event store. 1 event = 1 JSON file (ULID name).
                               # CLI-only writes. The single source of truth for lifecycle state
  state.json                   # snapshot derived from the journal (regenerable; not the source of truth)
  vision/                      # origin canon. v<NNN>-<slug>.md
  specs/                       # s<NNN>-<slug>/spec.md (required-section scheme) + attachments/
  campaigns/                   # c<NNN>-<slug>/charter.md (execution envelope binding multiple runs)
  runs/                        # r-<ulid>-<slug>/. handoff.md (generated) / notes.md (authored) /
                               # report.md (terminal packet)
  evidence/                    # verifications/ (verify's verdict + raw output) / reviews/ (review records)
  decisions/                   # d<NNN>-<slug>.md (human ruling records; only decide registers them)
  gaps/                        # g<NNN>-<slug>.md (the single ledger of unresolved items)
  roles/                       # the 3 role cards: planner / worker / reviewer
  out/                         # compile output (runtime bundle). gitignored. not canon
  reference/                   # a free area not managed by the kernel
  src/                         # artifact repo root (nested git). CLI only reads and verifies
```

Markdown is exclusively for authored content; frontmatter holds only id and refs and has no status field. Even if the AI edits Markdown, state does not move; state is advanced only by a transition event that has passed a guard. `src/` is a clean boundary for artifacts, and all cc-iasd-managed artifacts (spec / runtime / evidence / report, etc.) are placed outside `src/`. When dealing with multiple repos, place them side by side under `src/` and include a `src/<repo>/` prefix in the Surfaces globs.

## Overview of the standard flow

The standard flow for building one feature end to end is three phases: planning -> run cycle -> closing (details in `docs/development/04_core_workflow.md`, diagram in `docs/development/standard_flow_overview.mmd`).

```text
Phase 1: planning and gates
  new vision -> planner authors it -> decide (human approval) -> vision approved
  new spec   -> planner authors it. Undetermined items file a gap + [UNRESOLVED: gNNN]
             -> review record (gate=spec) -> spec ready
  new campaign -> planner authors the charter -> review record (gate=launch) -> campaign launch

Phase 2: run cycle (repeat within a campaign until tasks are exhausted; parallelizable)
  run open   -> the CLI mechanically synthesizes the handoff (if upstream is missing,
                it enumerates the shortfall and rejects)
  implement  -> the worker edits only src/ using the handoff as input, and reports via
                notes and by filing gaps
  run return -> the CLI records a per-repo git diff snapshot as measured
  run verify -> the CLI runs the Checks as a child process and cross-checks Surfaces vs. diff
  review record (gate=run) -> run accept

Phase 3: closing
  review record (gate=completion) -> report (completion)
  -> the human reads the report and the reviews -> campaign close
```

A run terminates through only the following three choices, and block, which returns the shortfall, is the cheapest legal exit.

```text
accept:   requires a passing verification + a review record + 0 blocking gaps (the most expensive)
block:    generates a backtrack request and moves to blocked (satisfied by naming the missing ref; the cheapest)
escalate: generates an escalation packet and moves to escalated (awaiting a decision)
```

## Current status

The planned scope (P1–P4) is fully implemented: the minimal adhoc-run system, the full chain from vision approval through campaign close (with all four gates in operation), session launch (bundle compile via runtime adapters), worktree isolation for parallel runs, and doctor's audit check suite. The following commands are implemented (each command's purpose, inputs, outputs, and transitions are in `docs/development/08_commands_and_workflows.md`).

```text
cc-iasd                                        # no arguments = human inbox
cc-iasd init [project-context-path]            # scaffold + journal + git init
cc-iasd doctor                                 # checks structure / references / src contamination / guard recomputation / evidence sufficiency
cc-iasd status [--plan | <ref>]                # a view derived from the journal

cc-iasd new vision|spec|campaign <slug>        # create scaffold (the AI authors the authored sections)
cc-iasd spec ready <id>
cc-iasd campaign launch|close <id>

cc-iasd run open <campaign-id> --tasks <T..> | --adhoc "<goal>" --check "<cmd>" [--spike] [--worktree]
cc-iasd run handoff <run-id>                   # print the synthesized handoff to stdout (the Tier 0 canonical path)
cc-iasd run return <run-id>                    # record the diff snapshot as measured
cc-iasd run verify <run-id>                    # run Checks via the CLI + surface cross-check
cc-iasd run accept|block|escalate <run-id>     # the three terminal choices
cc-iasd session start|resume <run-id>          # compile the bundle into out/<run-id>/ (adapter: none / claude-code) / generate the resume brief

cc-iasd review record <ref> --gate spec|launch|run|completion
cc-iasd gap add|close|route <ref>
cc-iasd decide <decision-id> [--adopt <file>]  # human-exclusive. TTY by default / --adopt for asynchronous intake
cc-iasd report <ref>
cc-iasd retire <ref>
cc-iasd role show planner|worker|reviewer
```

There are two execution-verified paths. The shortest, adhoc path is: `init -> run open --adhoc --check -> run handoff` synthesizes the handoff and hands it to the runtime, and `run return -> run verify -> review record --gate run --verdict pass -> run accept` completes the run end to end. The full-chain path runs `new vision` (declaring Capabilities) `-> decide --approve -> new spec -> spec ready -> new campaign -> campaign launch -> run open <campaign-id> --tasks -> run to completion -> review record --gate completion -> report -> campaign close`, and the ordering constraint on run open via `after:` in the charter's Coverage, the all-declared-tasks-consumed check, and the covered / uncovered capability projection in `status --plan` are all verified by e2e tests. When a guard is not satisfied (return with no notes present, accept before verify, spec ready with a blocking gap open, run open before a preceding spec has completed, and so on) no transition occurs and a rejection message is returned.

### roadmap

The planned scope (P1–P4) is complete. Distribution of the handoff to the implementation runtime is done via `run handoff`'s stdout output (the Tier 0 canonical path), and additionally via `session start`, which compiles the bundle into `out/<run-id>/`. The claude-code adapter provides the Tier 1 acceleration layer (generating settings and a write-guard hook), but the three invariants are closed by Tier 0 alone. For future extension candidates and matters to be decided after operational observation, see `docs/development/09_future_vision.md` and `docs/development/10_todo.md`.

## Vocabulary mapping

The kernel's vocabulary is organized into de-facto-conforming vocabulary that converged in prior art, and differentiating vocabulary for which no established counterpart exists (details in chapter 6 of `docs/development/07_framework_integration.md`).

```text
cc-iasd vocabulary     nearest prior-art vocabulary / positioning
vision (formerly ideal) GSD's vision / Agent OS's mission / BMAD's brief. De facto conforming.
spec / plan / tasks     Spec Kit's spec / plan / tasks. De facto conforming (artifact-vocabulary compatible).
campaign                No counterpart. Close to BMAD / CCPM's epic and GSD's phase, but an
                        execution-plan envelope carrying stop conditions, a risk stage, and a
                        non-regression focus. Differentiating vocabulary.
run                     A general agent run. Corresponds to Devin / Codex cloud's session. De facto conforming.
evidence                Kosli's evidence / the audit trail in audit contexts. De facto conforming.
escalation packet       No counterpart. Corresponds to the decision-ready context package in HITL
                        discourse. Differentiating vocabulary.
backtrack request       No counterpart. Differentiating vocabulary.
gap                     open item / follow-up are general PM terms, but this is a concept that
                        unifies needs-human-decision / needs-upstream-fix / needs-info / candidate
                        into a single ledger.
feature (retired)       Retired as a standalone artifact. Replaced by: ordering via charter
                        depends_on, vision Capabilities + a covers projection, and mid-term
                        planning inventory via gap route=vision.
roadmap (retired)       Retired as a standalone artifact. Replaced by: the charter depends_on guard
                        and the projection view of status --plan.
```

## Design documents

The design canon is in `docs/development/`. The key documents are:

```text
00_index.md                 overall index / definition of cc-iasd / development order
02_conceptual_design.md     mapping of the 3 invariants to structure / node model / journal as canon / the three terminal choices
03_project_context_architecture.md  physical structure / journal format / write-path allowlist / multi-repo
04_core_workflow.md         the standard workflow (the transition sequence to build one feature end to end)
05_autonomy_protocol.md     state machine / transition guards / stop conditions / reject ladder / mechanics of decide
06_artifact_and_evidence_model.md  event schema / verification generation rules / packet required fields
07_framework_integration.md integration policy with prior art / vocabulary mapping
08_commands_and_workflows.md  CLI command list / guard rejection message spec / onboarding flow
12_role_design.md           the 3 role cards: planner / worker / reviewer + human
```

## License

MIT
