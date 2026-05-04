# Coding Conventions

## 1. Operating Stance

Preserve evidence, explain design intent, and make future change safer.

## 2. Language Policy

- `rules/language-policy.md` is the authoritative source for project language settings and language-domain boundaries.
- Follow `rules/language-policy.md` for development language, documentation language, commit message summaries, README language, code-internal language, and product-facing language.
- For representative code-internal targets, see `rules/language-policy.md`: identifiers, type names, code comments, JSDoc/TSDoc, and API field names.
- This document only adds coding-specific consequences of that policy:
  - code-internal naming and comments stay in English
  - commit messages keep the format `<type>: <summary>`
  - coding-specific exceptions must follow the exception handling defined in `rules/language-policy.md`

## 3. Quality Principles

- Prefer clarity over cleverness.
- Keep functions and modules focused on one responsibility.
- Make failure modes explicit.
- Split files before they become difficult to reason about.
- Do not accept hidden coupling as normal.
- Follow the principle of least surprise.
- Avoid deep nesting (maximum 3–4 levels).
- Write clean, readable, and maintainable code.

## 4. Naming Conventions

- Use descriptive, meaningful names.
- Avoid abbreviations unless widely recognized.
- Follow language-specific conventions:
  - TypeScript/JavaScript: camelCase for variables/functions, PascalCase for classes/types.
  - Python: snake_case for variables/functions, PascalCase for classes.
  - File names: kebab-case for multi-word names.

## 5. File Organization

- One primary export (class or main function) per file.
- Group related functionality in the same directory.
- Separate concerns: logic, types, constants, utilities.
- Keep files under 300 lines when practical.

## 6. Import Order

Organize imports in this order:
1. Standard library
2. Third-party dependencies
3. Internal absolute-path imports
4. Internal relative-path imports

Insert a blank line between each group.

## 7. Error Handling

- Always handle errors explicitly.
- Prefer typed or structured errors.
- Provide meaningful error messages.
- Log errors with sufficient context.
- Never swallow errors silently.

### Error Handling Patterns

| Pattern | When to use |
|---------|-------------|
| throw | Input validation failure, precondition violation, unrecoverable by caller |
| null / default | Absence of data is a normal case |
| flag | Only when throw inside a lock or complex promise chain causes propagation issues |

Default to throw. Use null return only when absence is normal. Use the flag pattern only to work around concurrency constraints.

## 8. Code Comments

- Explain "why", not "what". The code itself should be self-explanatory for "what".
- Update comments when the code changes.
- Remove commented-out code before committing.
- Use context-bearing tags:
  - `TODO(author): description`
  - `FIXME: description`
  - `NOTE: explanation`

## 9. Function Documentation

Document public APIs and complex functions with:
- Purpose of the function
- Parameter descriptions
- Return value description
- Exceptions that may be thrown
- Usage examples when helpful

## 10. Commit Policy

- Use a single-line commit message.
- Use the format `<type>: <summary>`.
- Write the summary in the Documentation Language defined in `rules/language-policy.md`.
- Keep the summary short and specific.
- Do not add a commit body unless explicitly required.
- Do not add `Co-authored-by` trailers unless explicitly instructed.
- Keep the summary line under 72 characters.
- Types: feat, fix, refactor, docs, test, chore, style.

## 11. Branch Strategy

- Main branch: `main`
- Feature branches: `feature/<brief-description>`
- Fix branches: `fix/<brief-description>`
- Always create a branch for new work.
- Delete branches after merge.

For review policy, testing policy linkage, and the development flow, read `rules/development-process.md`.

## 12. TypeScript / JavaScript

### Type Safety
- Prefer explicit types over `any`.
- Use `unknown` when the type is genuinely unknown.
- Enable strict mode in the TypeScript configuration.
- Avoid type assertions unless absolutely necessary.

### Async / Await
- Prefer async/await over raw Promises.
- Always handle Promise rejections.
- Use `Promise.all()` for parallel operations.
- Do not mix callbacks and Promises.

### Modern JavaScript
- Use ES6+ features appropriately.
- Prefer `const` over `let`; avoid `var`.
- Use arrow functions for callbacks.
- Use template literals for string interpolation.
- Use destructuring for objects and arrays.

## 13. Transparency

- Log all significant state changes.
- Make decision points explicit.
- Provide clear status information.
- Avoid black-box behavior.

## 14. Security Practices

- Never commit credentials, API keys, or secrets.
- Use environment variables for sensitive configuration.
- Validate and sanitize all external input.
- Follow the principle of least privilege.
- Keep dependencies up to date.

## 15. Performance

- Optimize only when necessary; measure first.
- Avoid premature optimization.
- Choose appropriate data structures.
- Watch memory usage in long-running processes.
- Log performance metrics for critical operations.

## 16. Deprecation

When deprecating code:
- Mark with `@deprecated` tag and explanation.
- Provide a migration path in documentation.
- Set a removal timeline.
- Update all existing usages.

## 17. Semantic Versioning

Follow semantic versioning:
- MAJOR: breaking changes
- MINOR: new features (backward-compatible)
- PATCH: bug fixes (backward-compatible)

## 18. Batch Processing Protocol

When processing large datasets (30+ items requiring individual operations):

1. Strategy review, then execute batch 1 only.
2. Quality check batch 1 results.
3. If quality check fails: stop, root-cause analysis, fix, restore clean state, retry from step 1.
4. If quality check passes: execute remaining batches (no per-batch QC needed).
5. Final quality check after all batches complete.

Rules:
- Never skip the batch 1 quality gate.
- Batch size limit: 30 items per session.
- Each batch must include a detection pattern for unprocessed items so restarts skip completed work.
- Verify data state before retrying after failure. Revert corrupted data if needed.

## 19. Critical Thinking

- Moderate skepticism: do not blindly accept instructions, assumptions, or constraints. Verify for contradictions or gaps.
- Propose alternatives: when a safer, faster, or higher-quality method exists, propose it with rationale.
- Early problem reporting: share broken assumptions or design flaws immediately.
- No over-criticism: do not halt on criticism alone. Unless truly unable to proceed, choose the best option and move forward.
- Execution balance: always prioritize the balance between critical review and execution speed.

## 20. File Operation Rule

Always read a file before writing or editing it.
