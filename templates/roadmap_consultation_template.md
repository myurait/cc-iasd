# Roadmap Consultation Template

This template is used by the Planning Lead role when asking the user to choose the next roadmap direction.

This is a direct user-facing message template, not an internal planning memo.
It should help the user quickly understand where the product stands against the ideal experience and what decision is being requested now.

## Usage Principles

- Generate the final user-facing message in the Documentation Language defined in `rules/language-policy.md`.
- Explain the user meaning first, then add internal document names or identifiers only if they improve traceability.
- Do not make internal labels such as `feature-003`, `epic-001`, or `roadmap_...` the subject of the main message.
- If technical or internal terms are necessary, explain the plain-language meaning first and add the internal term only as a supplement.
- Prefer the wording and experience framing used in `design/00-ideal-experience.md`.
- Keep one consultation message focused on one decision.
- Emphasize "which part of the ideal experience this roadmap will close" before listing implementation work.
- Do not mix work-progress reporting with the decision request. A consultation message answers "what should we decide?" not "what did I do so far."
- If a status update is needed, put it in the development log, not in the consultation message.

## Choosing the Right Format

- Use the **Lightweight Format** below when:
  - there is a clear recommended option
  - the purpose of the consultation is confirmation, not a genuine tradeoff choice
  - the user can say yes or redirect in one sentence
- Use the **Full Format** when:
  - the tradeoffs are genuinely balanced
  - reasonable user preference could change the answer
  - the decision has significant structural consequences that are hard to reverse

---

## Lightweight Format

Use this format when the recommended option is clear and the escalation is for confirmation.

### Structure

1. **What is being decided and why it needs confirmation** — one sentence connecting to the user experience, not to internal milestone names.
2. **Recommendation and reason** — one sentence stating the recommended direction and why.
3. **Closing question** — one short, direct question. Mention that the user can redirect if they prefer a different direction.

### Lightweight Example

> Starting work on making conversation resumption feel natural.
> Recommending we begin with a lightweight approach using existing documents and recent task history, adding a dedicated persistence layer later if needed. This lets us validate the behavior on the current foundation first.
> OK to proceed in this direction? Let me know if you prefer a different approach.

---

## Full Format

Use this format when the tradeoffs are genuinely balanced and reasonable user preference could change the answer.

### 1. Why This Roadmap Consultation Is Happening

- State one of the following first:
  - the previous roadmap has been completed
  - the current roadmap needs a major correction

### 2. Current Position Against the Ideal Experience

- Relevant ideal experience area:
  - describe it in plain language instead of citing the document section as the main explanation
- What already works:
  - what the user can already do today
- What is still missing:
  - what remains inconvenient or incomplete for the user
- Progress view:
  - which ideal-experience pillars have already advanced
  - which pillars are still clearly behind

### 3. The Decision Requested From the User

- Write this in one sentence.
- Example:
  - Decide which missing part of the ideal experience should be prioritized in the next roadmap.

### 4. Recommended Direction

- Recommendation:
  - write it in plain language
- Why this is recommended:
  - how much it advances the ideal experience
  - how much it removes blockers for other strong candidates
  - what change the user would actually feel

### 5. Other Options

- Option A:
  - what it would advance
  - strengths
  - weaknesses
- Option B:
  - what it would advance
  - strengths
  - weaknesses

### 6. What This Roadmap Would Advance

- If this is chosen, this part of the ideal experience moves forward:
- This part still would not be addressed yet:
- Expected user-visible change after the roadmap completes:

### 7. What Would Still Remain Afterward

- Remaining gaps in the ideal experience:
- The next major decision likely to follow:

### 8. Closing Question

- End with one short, direct question.
- Do not combine multiple unrelated decisions in the same closing question.

---

## Bad Directions

- `We should do feature-003 first.`
- `We need to fix the context memory model before narrowing the dispatcher boundary.`
- `We will place roadmap_202604... in current.`
- `I have self-driven up to this point and produced the design package for Milestone 1. From here on it is a long-lived structural decision, so it is better not to lock it in without you.`
- `Before moving the first stage of the active roadmap into implementation, I need you to decide which foundation to start conversation continuity on.`
- `Milestone 1: start with a lightweight approach using existing documents and recent task history, or add a dedicated conversation-continuity persistence layer at this stage.`

The last three fail because they mix the agent's own progress reporting with the decision request, use internal milestone names and planning jargon as the subject, and assume the user has the same internal context as the agent.

The first three fail because they use internal identifiers as the primary subject and provide no user-facing context.

## Better Direction Examples

- `I think the next roadmap should first reduce the need for users to repeat the same context.`
- `The main reason is that the biggest current frustration is still the amount of manual explanation required before work can begin.`
- `If we choose this direction now, the next stage can build more advanced automation on stable foundations.`
- `Starting work on making conversation resumption feel natural. Beginning with a lightweight approach using existing documents and task history.`
- `A dedicated persistence layer can be added later if needed, so recommending we validate with the lightweight approach first.`
