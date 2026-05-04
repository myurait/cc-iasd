# Roadmap Share Template

This template is used by the Planning Lead role when sharing an already decided roadmap with the user.

This is not a file-change summary.
It should help the user quickly understand how the roadmap moves the product closer to the ideal experience.

## Usage Principles

- Generate the final user-facing message in the Documentation Language defined in `rules/language-policy.md`.
- Do not lead with document names, internal identifiers, or technical jargon.
- Explain the user-facing meaning first, then add document references only if they help traceability.
- Prefer the wording and experience framing used in `design/00-ideal-experience.md`.
- Focus on "how much closer this gets to the ideal experience" rather than listing implementation work.
- Always include both progress and remaining gaps.

## Template

### 1. Why This Roadmap Was Created or Changed

- State one of the following first:
  - the previous roadmap has been completed
  - the current roadmap needed a major correction

### 2. Current Position Against the Ideal Experience

- Relevant ideal experience area:
  - describe it in plain language
- What already works:
- What is still missing:

### 3. What This Roadmap Will Advance

- Main purpose:
  - which missing part of the ideal experience this roadmap is meant to close
- Expected user-visible experience after the roadmap completes:
  - what becomes more natural
  - what becomes less manual

### 4. What This Roadmap Will Do and Not Do

- What this roadmap will do:
- What this roadmap will not do yet:

### 5. How Much This Advances the Ideal Experience

- What this roadmap improves:
- What still remains after it:
- Progress view:
  - which pillars move forward
  - which pillars remain the main gaps

### 6. Why This Order Was Chosen

- Write this in plain language.
- Example reasons:
  - it is a foundation for multiple missing capabilities
  - it reduces the biggest current user pain first
  - later capabilities would stay unstable without it

### 7. What Becomes the Next Likely Topic

- The theme most likely to be discussed next:
- The decision that will still need to be made then:

## Bad Directions

- `Milestone 1 is front-agent/context foundation.`
- `feature-004 remains deferred.`
- `This has been reviewed and committed.`

## Better Direction Examples

- `The next roadmap first strengthens the foundation for carrying user context forward with less manual effort.`
- `Once this is done, the next stage can add more advanced automation on stable assumptions.`
- `At the same time, this roadmap alone still will not complete every user-facing workflow that depends on that foundation.`
