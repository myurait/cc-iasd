# Path Convention for Role Definitions

## How Paths Work in Role Definitions

After `cc-iasd init`, all framework files are transcribed into `project-context/` within the project. Role definitions use project-root-relative paths.

### Framework paths (inside rules/policies/)

Paths like `rules/policies/...`, `rules/roles/...`, `rules/templates/...` are relative to the project root. These correspond to the framework's `rules/`, `roles/`, and `templates/` directories that were transcribed by `cc-iasd init`.

### Project paths (inside ops/)

Paths like `ops/logs/`, `ops/features/`, `ops/roadmaps/`, `ops/specs/`, `ops/milestones/`, `ops/decisions.md`, and `ops/knowledge.md` are relative to the project root.

### Path mapping from framework source to project

After transcription, the mapping is:

- `rules/` -> `rules/policies/`
- `roles/` -> `rules/roles/`
- `templates/` -> `rules/templates/`
- `logs/` -> `ops/logs/`
- `reviews/` -> `ops/milestones/<milestone-id>/reviews/`
- `roadmap/` -> `ops/roadmaps/`
- `design/` -> `ops/specs/<spec-id>/`
- `features/` -> `ops/features/`
- `decisions.md` -> `ops/decisions.md`
- `knowledge.md` -> `ops/knowledge.md`
- `project-policies.md` -> `rules/project-policies.md`

### Changing paths

After `cc-iasd init`, the project owns all transcribed files. To change directory names or structure, edit the files directly. There is no framework command to regenerate or update them.
