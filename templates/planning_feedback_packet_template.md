# Planning Feedback Packet: {{feedbackId}}

- ID: {{feedbackId}}
- Status: open
- Summary: {{summary}}
- Source Report: {{sourceReport}}
- Source Run: {{sourceRun}}
- Source Campaign: {{sourceCampaign}}
- Created At: {{createdAt}}
- Updated At: {{updatedAt}}
- Resolution: TBD
- Resolution Target: TBD
- Resolution Summary: TBD

## Feedback Items

Each feedback item must have exactly one Type and exactly one Recommended Planning Role. Split combined feedback into separate items before routing.

### item-001

- Type: TBD
- Target Candidate: TBD
- Summary: TBD
- Evidence Refs: {{sourceReport}}
- Human Decision Required: yes / no / TBD
- Recommended Planning Role: TBD
- Allowed Planning Roles: Planning Lead, Feature Scope Designer, Spec Designer, Ideal Interviewer, Human, none
- Blocking: yes / no / TBD

## Routing Notes

- TBD

## Tool-Owned Fields

- ID
- Status
- Summary
- Source Report
- Source Run
- Source Campaign
- Created At
- Updated At
- Resolution
- Resolution Target
- Resolution Summary

AI agents may edit Feedback Items and Routing Notes after `cc-iasd planning-feedback add` creates the file. Tool-owned fields are updated by `cc-iasd planning-feedback resolve`.
