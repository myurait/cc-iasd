# Roles

This directory defines reusable agent roles for the project.

A role is a set of instructions that an AI agent adopts when performing a specific function such as reviewing, planning, or auditing. Roles are tool-agnostic: the same definition can be consumed by Claude Code, Codex, or any other agent runtime.

## Rules

- Each role lives in its own file named `{role-name}.md`.
- A role file defines stance, responsibilities, required reading, and output format.
- Role files are stable rule documents and must be written in English per `rules/policies/language-policy.md` (after init).
- Tool-specific wrappers (e.g., Claude Code's `.claude/agents/`) may reference the canonical role file here. Such wrappers are local convenience files and are not version-controlled.

## Available Roles

- `worker.md` — minimal-context implementer that focuses on coding, testing, and spawning review roles. Entry point for all implementation tasks.
- `compliance-auditor.md` — audits language policy compliance and document format quality across all changed files. Spawned for every commit (Light review).
- `code-quality-auditor.md` — audits coding conventions, naming patterns, test design quality, and design document drift. Spawned when code files are changed (Light review).
- `devils-advocate.md` — adversarial reviewer that enforces project rules as a strict guardian. Spawned during Full review (feature completion, milestone, architecture changes).
- `planning-lead.md` — senior engineer role for roadmap planning, milestone evaluation, and user-facing plan communication. Spawned on feature completion, milestone achievement, and planning inquiries.
