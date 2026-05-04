# Review

Use flat bullets and headings. Do not use Markdown tables in review evidence.

## Header

- Date:
- Reviewer:
- Base Commit:
- Scope:
- Review Type: Light review / Full review
- Review Roles:
  - Light review: Compliance Auditor, Code Quality Auditor
  - Full review: Devil's Advocate (+ Planning Lead when Trigger E applies)
- Trigger: (which trigger condition or "every commit" for Light review)

## Review Criteria

Fill only the criteria that match the review type and roles above.

### Light Review — Compliance Auditor

- All comments and documentation are in the declared language.
- Documentation is updated.
- No credentials or secrets in the commit.
- Backlog format is correct (if changed).
- File naming and structure conventions are followed.

### Light Review — Code Quality Auditor

- Code is properly formatted.
- Naming conventions are followed.
- Tests are passing.
- Error handling is in place.
- No credentials or secrets in the commit.

### Full Review — Devil's Advocate

- Added structure is justified against simpler alternatives.
- The change can be explained to the user without relying on internal implementation context.
- Architecture judgment and cross-cutting consistency are sound.
- Design quality does not regress.
- No credentials or secrets in the commit.

### Full Review — Planning Lead

- Roadmap alignment and milestone progress are evaluated.
- Ideal experience impact is assessed.
- Backlog priority reflects current state.

---

## Findings

### Critical

- None

### High

- None

### Medium

- None

### Low

- None

---

## Review Dimensions

Fill only the dimensions that match the review type and roles above.

### Devil's Advocate Review

- Debt Prevention:
- Complexity Versus Value:
- Decomposition and Boundaries:
- Alignment With Declared Design:
- Senior-Engineer Smell Detection:
- Explanation Responsibility:

### Document Review

- Notes:

### Security Review

- Notes:

### Design Review

- Notes:
- Simpler alternative considered:
- Traceability from user problem to planning document:
- Intended experience change:
- Validation completeness:

### Code Review

- Notes:

---

## Implementation Response Plan

- Date:
- Reviewer:
- Base Commit:
- Plan Summary:
- Planned Fixes:
- Deferred Items:

---

## Follow-Up Review History

### Entry 1

- Date:
- Reviewer:
- Base Commit:
- Review Type: Light review / Full review
- References:
- Result:
- Notes:
- Remaining Risks:
- Risk Handling:
  - accepted residual risk with monitoring or next-review trigger
  - deferred planned work with tracked destination document or phase
  - explicit user decision required
  - unresolved finding requiring another fix-and-review cycle
