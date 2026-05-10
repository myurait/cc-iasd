# Development Process

## 1. Development Flow

### 1.1 Mandatory Steps (6 steps, always required)

All changes must follow these six steps in order.

```text
Step 1: Read       — Read existing code and related documents before making changes
Step 2: Implement  — Write code following rules/policies/coding-conventions.md, pass the linter
Step 3: Test       — Follow rules/policies/testing.md, new code requires tests, all tests must pass
Step 4: Log        — Record a development log entry in ops/evidence/logs/
Step 5: Review     — Planning Lead or the human runtime owner launches review roles (see Section 1.2)
Step 6: Commit     — Stage files explicitly by name (git add -A is prohibited),
                     do not commit runtime or generated files
```

Missing documentation, review evidence, or log entries means the task is not complete.

### 1.2 Review Launch Rules

Worker does not spawn review roles. Nested subagent runtime is not allowed.

After Worker completes Steps 1-4, the Worker returns an implementation handoff packet to the Planning Lead or human runtime owner. The Planning Lead or human runtime owner launches review roles from the parent runtime.

**Light review (every commit):**

- Code Quality Auditor: launched when code files are changed
- Compliance Auditor: launched after the required code quality or document review step

**Full review (trigger conditions):**

- Light review roles (as above)
- Devil's Advocate: launched under Trigger D conditions before Compliance Auditor
- Planning Lead: parent runtime owner for orchestration, or launched under Trigger E when the parent runtime is human-owned

### 1.3 Trigger Steps (conditional, only when triggered)

**Trigger A — New feature / roadmap work:**

- When: starting implementation of a new feature (epic or supporting feature)
- Additional steps:
  1. Confirm ideal artifact in `product/ideal/`
  2. Select or revise the roadmap item from the active roadmap
  3. Define completion criteria and validation method

**Trigger B — Architecture change:**

- When: module boundary changes, new service addition, communication pattern changes, major directory restructuring
- Additional steps:
  1. Record human decisions in `user/decisions.md` when user approval is required
  2. Update the relevant `product/ideal/` artifact when product canon changes

**Trigger C — Document structure change:**

- When: new file creation, file removal, file relocation, cross-reference changes
- Additional steps:
  1. Verify existing cross-references from other files
  2. Confirm no broken references

**Trigger D — Full review (Devil's Advocate):**

- When: Trigger B conditions, rule changes (`rules/policies/` or CLAUDE.md rule sections), feature completion, campaign or run completion, explicit user request
- Additional steps:
  1. Planning Lead or the human runtime owner launches Devil's Advocate
  2. Create a review evidence file in `ops/evidence/reviews/` (see Section 2.4)
  3. Launch Compliance Auditor after Devil's Advocate findings are available

**Trigger E — Planning Lead:**

- When: feature implementation completed, campaign or run completed, roadmap creation or update needed, user asks about project plans
- Additional steps:
  1. Launch Planning Lead when the parent runtime is not already Planning Lead
  2. Planning Lead applies the roadmap consultation template or roadmap share template
- Coordinates Trigger D and compliance review ordering

### 1.4 Development Log Entry

- Record in `ops/evidence/logs/`.
- Log file name: `log_{YYYYMMDDhhmmssSSS}_{type}.md` (timestamp is the file creation time).
- Every entry must include `Date` (exact execution timestamp with timezone) and `Author`.
- Fields: Date, Author, Task, Changes, Verification, Issues, Follow-up, Reusable lesson.
- Keep at most 20 entries in one active log file.
- If the next append would exceed 20 entries, move the current file to `ops/evidence/logs/archived/` and create a new active file.

## 2. Review Rules

### 2.1 Two-Tier Review Process

**Light review:**

- Roles: Compliance Auditor + Code Quality Auditor
- Scope: formal correctness (language policy, document format, naming, test design, design document divergence)
- Evidence: results are recorded in the development log entry (no separate review evidence file)
- Trigger: every change
- Runtime order: Code Quality Auditor runs first when code files changed; Compliance Auditor runs after the relevant quality review evidence or document-only handoff is available

**Full review:**

- Roles: Devil's Advocate + Compliance Auditor (+ Planning Lead when Trigger E applies and is not already parent runtime)
- Scope: architecture judgment, design quality, cross-cutting consistency
- Evidence: review evidence file in `ops/evidence/reviews/`
- Trigger: Trigger D and/or Trigger E conditions only
- Runtime order: Devil's Advocate runs before Compliance Auditor

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
- Store review evidence in `ops/evidence/reviews/`.
- Keep only the newest 5 review evidence files outside `archived/`. Move older files to `ops/evidence/reviews/archived/`.
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
- When a temporary workaround is accepted, add it to an appropriate feature scope in `ops/scopes/features/` with `type: debt`.

### 2.6 Post-Fix Re-Review

Post-fix re-review is mandatory after every review round that produced findings.

- The re-review inherits the full scope and lens of the original review.
- Append re-review results to the original review file as a follow-up review entry.
- Every follow-up entry must include `Date`, `Reviewer`, `Base Commit`, `Review Type`, referenced plan items, result, and remaining risks.
- Remaining risks must have an explicit disposition:
  - accepted residual risk with monitoring or next-review trigger
  - deferred planned work with tracked destination document or phase
  - explicit user decision required
  - unresolved finding that requires another fix-and-review run
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
- Log human decisions in `user/decisions.md`; log run-local decisions in `ops/execution/runs/<run-id>/state.md`.
- Extract reusable lessons into run-local `ops/execution/runs/<run-id>/knowledge.md` before promoting stable lessons to `rules/policies/`.
- Keep current roadmap scopes outside `archived/` under `ops/scopes/roadmaps/`.
- Name roadmap files `rNNN-lowercase-kebab-case.md`.
- Move replaced, completed, cancelled, or superseded ops artifacts with `cc-iasd ops archive`.
- Canonical ideal artifacts live in `product/ideal/`.
- Move product artifacts that are no longer canonical with `cc-iasd product outdate`.
- Use `cc-iasd view ...` for temporary context views. Do not commit generated view output as a canonical artifact.
- Raw interviews, imported user specifications, superseded drafts, and other historical planning inputs must be archived under `reference/historical-documents/`.
- Historical documents are preserved for traceability only. They are not authoritative for active planning once normalized.
- Every historical document archive must have an entry in `reference/INDEX.md` with archive date, summary, and canonical successor documents when applicable.

### Artifact Creation Authority

- AI agents may create and edit files under `src/` as normal implementation output.
- AI agents must not directly create, move, rename, archive, outdate, or delete files under `product/`, `ops/`, `rules/`, `runtime/`, `user/`, or `reference/`.
- New cc-iasd-managed artifacts must be created by `cc-iasd` commands or explicit human file operations.
- AI agents may edit authored content sections inside command-created artifacts.
- Tool-owned metadata, IDs, lifecycle state, source references, archive placement, and outdate placement must be updated by `cc-iasd` commands or explicit human file operations.
- Campaign queue status must be changed with `cc-iasd campaign mark-run`.
- Run-local open item entries must be created with `cc-iasd open-item add` and resolved with `cc-iasd open-item resolve`.

## 5. File Classification

### Master Rule Files (stable, low update frequency)

- `rules/policies/` — rule documents (this file, language-policy, coding-conventions, testing, AI_RUNTIME_RULES)
- `rules/roles/` — role definitions
- `rules/templates/` — review and roadmap templates

Master rule files are always written in English and are reusable across projects.

### Project Progress Files (updated during development)

- `product/ideal/` — product ideal canon
- `product/specs/` — requirements, plan, and tasks
- `ops/scopes/` — features and roadmaps
- `ops/execution/` — campaigns, runs, run state, handoff, and local knowledge
- `ops/evidence/` — logs, reviews, and reports
- `reference/` — non-canonical reference material

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

## 7. Run Knowledge Management

- Worker may append run-local lessons to `ops/execution/runs/<run-id>/knowledge.md`.
- Compliance Auditor reviews run-local knowledge and proposes rule promotion when a lesson should be elevated to a master rule file (`rules/policies/*.md`).
- When a promotion proposal is approved, move the lesson to the appropriate master rule file.
- Worker's required reading does not include global knowledge files. Lessons reach Worker context through run handoff or promotion to master rules.

## 8. Testing Rules

- `rules/policies/testing.md` is the canonical testing policy.
- All test scope, coverage, design, isolation, naming, execution, and manual-test rules in `rules/policies/testing.md` must be followed.

## 9. User Communication Principles

These principles apply to all roles when communicating with the user or with other roles.

### 9.0 Runtime-Origin Principle

All roles return their results to their runtime origin — the entity (user, Planning Lead, or human runtime owner) that invoked them.

- If the runtime origin is the user, follow the message structure and reporting rules below.
- If the runtime origin is Planning Lead, return results in the format that Planning Lead expects, such as handoff packets or findings with severity.
- Worker and Designer roles must not invoke review roles directly. Planning Lead or the human runtime owner performs review routing.
- Critical findings that require user attention must be flagged, even if the runtime origin is Planning Lead.

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
