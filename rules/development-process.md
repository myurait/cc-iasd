# Development Process

## 1. Development Flow

### 1.1 Mandatory Steps (6 steps, always required)

All changes must follow these six steps in order.

```text
Step 1: Read       — Read existing code and related documents before making changes
Step 2: Implement  — Write code following rules/policies/coding-conventions.md, pass the linter
Step 3: Test       — Follow rules/policies/testing.md, new code requires tests, all tests must pass
Step 4: Log        — Record a development log entry in ops/logs/
Step 5: Review     — Spawn review roles (see Section 1.2)
Step 6: Commit     — Stage files explicitly by name (git add -A is prohibited),
                     do not commit runtime or generated files
```

Missing documentation, review evidence, or log entries means the task is not complete.

### 1.2 Review Spawn Rules

Worker spawns review roles after completing Steps 1-4.

**Light review (every commit, 2 spawns):**

- Compliance Auditor: always spawned for all changes
- Code Quality Auditor: spawned when code files are changed

**Full review (trigger conditions, up to 4 simultaneous spawns):**

- Light review roles (as above)
- Devil's Advocate: spawned under Trigger D conditions
- Planning Lead: spawned under Trigger E conditions

### 1.3 Trigger Steps (conditional, only when triggered)

**Trigger A — New feature / roadmap work:**

- When: starting implementation of a new feature (epic or supporting feature)
- Additional steps:
  1. Confirm ideal experience in `ops/ideal/ideal-experience.md`
  2. Select or revise the roadmap item from the active roadmap
  3. Define completion criteria and validation method

**Trigger B — Architecture change:**

- When: module boundary changes, new service addition, communication pattern changes, major directory restructuring
- Additional steps:
  1. Record an ADR in `ops/decisions.md`
  2. Update `ops/ideal/product-charter.md`

**Trigger C — Document structure change:**

- When: new file creation, file removal, file relocation, cross-reference changes
- Additional steps:
  1. Verify existing cross-references from other files
  2. Confirm no broken references

**Trigger D — Full review (Devil's Advocate):**

- When: Trigger B conditions, rule changes (`rules/policies/` or CLAUDE.md rule sections), feature completion, milestone achievement, explicit user request
- Additional steps:
  1. Spawn Devil's Advocate
  2. Create a review evidence file in the relevant milestone review directory (see Section 2.4)

**Trigger E — Planning Lead:**

- When: feature implementation completed, milestone achieved, roadmap creation or update needed, user asks about project plans
- Additional steps:
  1. Spawn Planning Lead
  2. Planning Lead applies the roadmap consultation template or roadmap share template
- May run in parallel with Trigger D

### 1.4 Development Log Entry

- Record in `ops/logs/`.
- Active log file name: `log_{YYYYMMDDhhmmss}.md` (timestamp is the file creation time).
- Every entry must include `Date` (exact execution timestamp with timezone) and `Author`.
- Fields: Date, Author, Task, Changes, Verification, Issues, Follow-up, Reusable lesson.
- Keep at most 20 entries in one active log file.
- If the next append would exceed 20 entries, move the current file to `ops/logs/archives/` and create a new active file.

## 2. Review Rules

### 2.1 Two-Tier Review Process

**Light review:**

- Roles: Compliance Auditor + Code Quality Auditor
- Scope: formal correctness (language policy, document format, naming, test design, design document divergence)
- Evidence: results are recorded in the development log entry (no separate review evidence file)
- Trigger: every change

**Full review:**

- Roles: Devil's Advocate (+ Planning Lead when Trigger E applies)
- Scope: architecture judgment, design quality, cross-cutting consistency
- Evidence: review evidence file in `ops/milestones/<milestone-id>/reviews/`
- Trigger: Trigger D and/or Trigger E conditions only

Full review does not re-check items covered by Light review. Responsibilities are separated, not duplicated.

### 2.2 Review Checklist (role-specific ownership)

Each review role checks only the items within its responsibility. Items are not duplicated across roles.

- No credentials or secrets in the commit. (all roles)
- Documentation is updated. (all roles)
- All comments and documentation are in the declared language. (Compliance Auditor)
- Code is properly formatted. (Code Quality Auditor)
- Naming conventions are followed. (Code Quality Auditor)
- Tests are passing. (Code Quality Auditor)
- Error handling is in place. (Code Quality Auditor)
- Added structure is justified against simpler alternatives. (Devil's Advocate)
- The change can be explained to the user without relying on internal implementation context. (Devil's Advocate)

### 2.3 Review Process

- Give constructive, respectful feedback.
- Focus on code quality, not personal preference.
- Explain the reasoning behind suggestions.
- Review critically by default. Do not assume the chosen work, approach, or decision is correct merely because it was implemented.
- Approve only when all concerns are addressed.
- After findings are produced, record the implementation response plan before fixes begin.
- Follow-up review must explicitly reference the implementation response plan items it verifies.

### 2.4 Review Evidence

- Use one review evidence file per review thread.
- Name review evidence files as `review_{YYYYMMDDhhmmss}_{scope_description}.md`.
- Keep `scope_description` concise, ASCII, and kebab-case.
- Store review evidence in `ops/milestones/<milestone-id>/reviews/`. Reviews not tied to a product milestone go in `ops/milestones/project-context/reviews/`.
- Keep only the newest 5 review evidence files in each milestone review directory. Move older files to `ops/milestones/<milestone-id>/reviews/archives/`.
- `README.md`, `rules/templates/review_template.md`, and `archives/` are not counted as review evidence files.
- Record severity, affected files, decision rationale, implementation response plan, and follow-up result.
- Record `Date` as the exact execution timestamp with timezone.
- Record `Reviewer` explicitly. When the reviewer is AI, write the model name in the publicly disclosable form.
- Record `Base Commit` for every initial review and every follow-up review entry.
- `Review Type` must match the actual review lens and criteria used.
- Do not use Markdown tables in review evidence. Use headings and flat bullet lists instead.

### 2.5 Review Finding Severity

- Critical and High: must be fixed before commit.
- Medium: fix or record as future work with justification.
- Low and design-only: recording is sufficient.
- When a temporary workaround is accepted, add it to the integrated backlog (`ops/features/backlog.md` with `type: debt`).

### 2.6 Post-Fix Re-Review

Post-fix re-review is mandatory after every review round that produced findings.

- The re-review inherits the full scope and lens of the original review.
- Append re-review results to the original review file as a follow-up review entry.
- Every follow-up entry must include `Date`, `Reviewer`, `Base Commit`, `Review Type`, referenced plan items, result, and remaining risks.
- Remaining risks must have an explicit disposition:
  - accepted residual risk with monitoring or next-review trigger
  - deferred planned work with tracked destination document or phase
  - explicit user decision required
  - unresolved finding that requires another fix-and-review cycle
- A follow-up review is not complete until each remaining risk has a recorded disposition and next handling path.
- Reject inadequate fixes and request re-work. After re-work, repeat until all findings are resolved.

## 3. Decision Escalation Rules

- Ask the user to decide before finalizing any long-lived choice that is materially preference-sensitive or changes the project's canonical structure.
- This includes at least:
  - canonical source selection
  - document hierarchy and new persistent layers
  - user-visible workflow changes
  - product-direction choices with meaningful tradeoffs
- When escalating using the full consultation format, present: the recommended option, the main alternatives, the merits and drawbacks of each option, and the expected impact scope.
- When using the lightweight consultation format, alternatives and tradeoff analysis may be omitted because the purpose is confirmation of a clear recommendation, not a genuine tradeoff choice.

### Autonomous Proceed Conditions

- When all of the following conditions are met, the recommended option may be adopted without user escalation:
  - there is exactly one recommended option and the reasoning is already documented in a design document or planning artifact
  - there is no plausible user preference that would favor an alternative
  - the decision is reversible without significant rework if the user later disagrees
- When proceeding autonomously:
  - record the decision and its rationale in the development log
  - briefly mention the autonomous decision and the chosen direction in the next direct communication with the user
- If any of the three conditions is uncertain, escalate.

### Escalation Message Rules

- A decision escalation message is direct user communication. It is not a status report.
- Do not mix work-progress reporting with decision requests.
- Use the lightweight consultation format when the recommended option is clear and the purpose is confirmation.
- Use the full consultation format only when the tradeoffs are genuinely balanced.

## 4. Documentation Rules

- Treat the project repository as the canonical source for development-facing documentation.
- Log all non-trivial architecture and policy decisions in `ops/decisions.md`.
- Extract reusable lessons into `ops/knowledge.md`.
- Keep at most one active roadmap file at the root of `ops/roadmaps/`.
- Name roadmap files `roadmap_{YYYYMMDDhhmmss}_{scope}.md`.
- Move replaced, completed, cancelled, or superseded roadmap files to `ops/roadmaps/archives/`.
- The canonical ideal experience planning source is `ops/ideal/ideal-experience.md`.
- Raw interviews, imported user specifications, superseded drafts, and other historical planning inputs must be archived under `user/archives/`.
- Historical documents are preserved for traceability only. They are not authoritative for active planning once normalized.
- Every historical document archive must have an entry in `user/archives/INDEX.md` with archive date, archive reason, summary, and canonical successor documents.

## 5. File Classification

### Master Rule Files (stable, low update frequency)

- `rules/policies/` — rule documents (this file, language-policy, coding-conventions, testing, AI_RUNTIME_RULES)
- `rules/roles/` — role definitions
- `rules/templates/` — review and roadmap templates

Master rule files are always written in English and are reusable across projects.

### Project Progress Files (updated during development)

- `ops/logs/` — development logs
- `ops/features/` — feature index, backlog, epics, and supporting features
- `ops/roadmaps/` — roadmaps
- `ops/specs/` — requirements, plan, and tasks
- `ops/milestones/` — milestone status, evidence, reviews, escalation, and reports
- `ops/decisions.md` — ADR
- `ops/knowledge.md` — reusable lessons

Project progress files are written in Documentation Language as defined in `rules/policies/language-policy.md`.

### Project Configuration Files (third category)

- `CLAUDE.md`, `AGENTS.md` — project configuration (English-based, project-specific references allowed)
- Tool configuration files (`.pre-commit-config.yaml`, `.gitleaks.toml`, `.claude/settings.json`, `eslint.config.js`, etc.) — governed by tool specifications, not by language policy

## 6. Backlog Format

Feature and debt items are managed in a single backlog file using tag-based integration.

### Common Required Fields (all items)

- `type`: `feature` | `debt`
- Summary: 1-2 sentence description
- Priority: `near` | `later` | `far`
- Blockers: dependency list (or "none")
- Design constraint: constraint from current design (or "none")

### Type-Specific Fields

- `type: feature` requires Experience Tie (link to an ideal experience pillar)
- `type: debt` requires Impact Scope (affected files or directories)

## 7. knowledge.md Management

- Worker may optionally append reusable lessons to `ops/knowledge.md` when recording development log entries.
- Compliance Auditor checks `ops/knowledge.md` line count. A warning is issued when it exceeds 100 lines.
- Compliance Auditor reviews `ops/knowledge.md` content and proposes rule promotion when a lesson should be elevated to a master rule file (`rules/policies/*.md`).
- When a promotion proposal is approved, move the lesson to the appropriate master rule file and remove it from `ops/knowledge.md`.
- Worker's required reading does not include `ops/knowledge.md`. Lessons reach Worker context through promotion to master rules.

## 8. Testing Rules

- `rules/policies/testing.md` is the canonical testing policy.
- All test scope, coverage, design, isolation, naming, execution, and manual-test rules in `rules/policies/testing.md` must be followed.

## 9. User Communication Principles

These principles apply to all roles when communicating with the user or with other roles.

### 9.0 Spawn-Origin Principle

All roles return their results to their spawn origin — the entity (user or role) that invoked them.

- If the spawn origin is the user, follow the message structure and reporting rules below.
- If the spawn origin is another role (e.g., review roles spawned by Worker), return results in the format that role expects (e.g., findings with severity).
- Critical findings that require user attention must be flagged, even if the spawn origin is another role.

### 9.1 Message Structure

- Lead with the user-visible meaning, not internal identifiers or jargon.
- One message, one topic. Do not combine unrelated decisions or status updates in a single message.
- Use structure: headings, bullet points, and a clear closing question or statement.
- Do not mix work-progress reporting with decision requests.
- Put what the user needs to decide or know first. Background and rationale come after.

### 9.2 Blocker and Error Reporting

When an agent encounters an error, blocker, or unexpected condition that prevents progress:

- What happened (one sentence)
- What is affected (scope of impact)
- What was attempted to resolve it
- What the user needs to provide or decide

### 9.3 Work Completion Reporting

When a task or work unit is complete, report to the user:

- What was completed, described relative to the roadmap or task definition
- Items that could not be completed due to blockers, if any
- New risks or technical debt discovered during the work
- Deviations from the original plan or assumptions (e.g., "this was more complex than expected and required a design decision not in the spec")
- What the next planned task is

### 9.4 Autonomous Decision Post-Reporting

When an agent proceeds autonomously under the Autonomous Proceed Conditions (Section 3):

- State the decision and the chosen direction in the next direct communication with the user
- Briefly explain why the autonomous-proceed conditions were met
- Indicate that the user can override the decision
