# Path Convention for Role Definitions

## How Paths Work in Role Definitions

After `cc-iasd init`, all framework files are transcribed into `project-context/` within the project. Role definitions use project-root-relative paths.

### Framework paths (inside rules/policies/)

Paths like `rules/policies/...`, `rules/roles/...`, `rules/templates/...` are relative to the project root. These correspond to the framework's `rules/`, `roles/`, and `templates/` directories that were transcribed by `cc-iasd init`.

### Project paths

Paths like `product/ideal/`, `product/specs/`, `ops/scopes/`, `ops/cycles/`, `ops/evidence/`, and `reference/` are relative to the project root.

### Path mapping from framework source to project

After transcription, the mapping is:

- `rules/` -> `rules/policies/`
- `roles/` -> `rules/roles/`
- `templates/` -> `rules/templates/`
- `logs/` -> `ops/evidence/logs/`
- `reviews/` -> `ops/evidence/reviews/`
- `roadmap/` -> `ops/scopes/roadmaps/`
- `design/` -> `product/specs/<spec-id>/`
- `features/` -> `ops/scopes/features/`
- `decisions.md` -> `user/decisions.md`
- `knowledge.md` -> `ops/cycles/<cycle-id>/knowledge.md`
- `project-policies.md` -> `rules/project-policies.md`

### Changing paths

After `cc-iasd init`, the project owns all transcribed files. To change directory names or structure, edit the files directly. There is no framework command to regenerate or update them.

### Runtime views

Commands such as `cc-iasd view current`, `cc-iasd view scope <id>`, `cc-iasd view cycle <id>`, and `cc-iasd view evidence` produce temporary stdout views. They are not canonical project files.
