# Roles

This directory defines reusable agent roles for the project.

A role is a set of instructions that an AI agent adopts when performing a specific function such as reviewing, planning, or auditing. Roles are tool-agnostic: the same definition can be consumed by Claude Code, Codex, or any other agent runtime.

## Rules

- Each role lives in its own file named `{role-name}.md`.
- A role file defines stance, responsibilities, required reading, and output format.
- Role files are stable rule documents and must be written in English per `rules/policies/language-policy.md` (after init).
- Tool-specific wrappers (e.g., Claude Code's `.claude/agents/`) may reference the canonical role file here. Such wrappers are local convenience files and are not version-controlled.

## Available Roles

- `ideal-interviewer.md` — elicits and maintains product ideal artifacts through direct human-facing interview. Owns ideal clarification before feature scope design.
- `worker.md` — minimal-context implementer that focuses on coding, testing, and spawning review roles. Entry point for all implementation tasks.
- `feature-scope-designer.md` — designs feature scopes and structured feature backlogs from product ideals and user decisions. Owns ideal-to-feature scope design.
- `spec-designer.md` — designs Spec Kit-compatible spec packages from feature scopes and roadmap direction. Owns feature-to-spec package design.
- `design-reviewer.md` — reviews newly authored ideal, feature, and spec artifacts with narrow context before Planning Lead receives them.
- `compliance-auditor.md` — audits language policy compliance and document format quality across all changed files. Spawned for every commit (Light review).
- `code-quality-auditor.md` — audits coding conventions, naming patterns, test design quality, and design document drift. Spawned when code files are changed (Light review).
- `devils-advocate.md` — adversarial reviewer that enforces project rules as a strict guardian. Spawned during Full review (feature completion, campaign/run completion, architecture changes).
- `planning-lead.md` — orchestration role for roadmap progression, campaign/run evaluation, designer handoff, and user-facing plan communication. Spawned on feature completion, campaign/run completion, and planning inquiries.
