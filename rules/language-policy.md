# Language Policy

This policy applies to all project output including review evidence, development logs, commit messages, and user-facing communication. Compliance is mandatory, not advisory.

## Project Policy

Project-specific language settings (Documentation Language, Development Language, Supported Product Languages) are the responsibility of each adopting project and are **not** defined in this file.

- Canonical Source: `project-policies.md` at the project root of the adopting project (`rules/project-policies.md` after `cc-iasd init`).
- Code-Internal Language: English (fixed; does not vary per project).

This document defines the language-domain rules and categories. For the actual language values used in a given project, consult `project-policies.md`.

## Language Categories

### 1. Development Language

- The programming language used to build the system.
- Covers: implementation code, services, adapters, pipelines, helper scripts.
- Decision rule: follow architecture decisions or equivalent design decisions.

### 2. Documentation Language

- The shared language used for project-progress documents, direct user communication, and commit message summaries.
- Covers: development logs, review evidence, roadmap documents, design documents, backlog and feature artifacts, ADRs, direct user explanations, commit message summaries.
- Decision rule: define during project rule setup.

### 3. Code-Internal Language

- The language used inside code as a technical representation.
- Covers: identifiers, type names, function names, class names, module names, test names, code comments, API field names.
- Fixed to English. This does not follow Documentation Language.

### 4. Product Language

- The language set supported by the product for user-visible text.
- Covers: UI text, user-facing error messages, status text, help text, onboarding text.
- Decision rule: decide during development planning or release planning.
- Does not have to match Documentation Language.

## File Classification and Language Rules

File classification is defined in `rules/development-process.md` Section 5. The language rules per classification are:

### Master Rule Files

- `rules/`, `roles/`, reusable templates
- Always written in English regardless of Documentation Language.

### Project Progress Files

- `product/ideal/`, `product/specs/`, `ops/scopes/`, `ops/execution/`, `ops/evidence/`, `reference/`
- Written in Documentation Language.

### Project Configuration Files

- `CLAUDE.md`, `AGENTS.md` — English-based; project-specific references may be mixed in.
- Tool configuration files (`.pre-commit-config.yaml`, `.gitleaks.toml`, `.claude/settings.json`, `eslint.config.js`, etc.) — governed by tool specifications, not by this policy.

### README Documents

- README documents must exist in English.
- README documents may also exist in Documentation Language.
- If both exist, the English README is mandatory and the Documentation Language README is additional.

### Template Documents

- Reusable template documents must be written in English.
- Template files must avoid project-specific dialogue language assumptions.
- Content generated from a template follows the language rule declared for that output, not the template language.

## Writing Rules

### For Documentation Language

- Content covered by Documentation Language should be written consistently in that language.
- Do not drift into partial English without reason.
- Standardized proper nouns, product names, protocol names, and code identifiers may remain unchanged.
- When technical terms are necessary, explain the plain-language meaning first and add the internal term only as a supplement.

### For User-Facing Communication

- User-facing communication follows Documentation Language unless an explicit exception is declared.
- Do not assume the user knows internal identifiers, abbreviations, file names, or feature IDs.
- Explain user meaning first, then add internal references only if they improve traceability.

### For Commit Messages

- Commit message summaries follow Documentation Language.
- Type prefix vocabulary: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`.
- The summary text itself follows Documentation Language.

### For Code-Internal Language

- Code-internal naming and comments are fixed to English.
- Documentation Language must not replace English inside code structure.
- Code-internal error messages, log messages, and exception messages follow Code-Internal Language.
- If a product-facing string is embedded in code, that string follows Product Language rules.

### For Product Language

- UI text follows Supported Product Languages.
- Product-facing error messages follow Supported Product Languages.
- Product-facing text must not silently fall back to Code-Internal Language unless explicitly accepted in project planning.

## Exception Handling

- If a temporary exception is allowed, record the reason and scope explicitly.
- Do not leave language exceptions as implicit practice.
- If an exception becomes long-lived, reflect it in this document or in a related ADR.
