# Interface-change requests

When a sprint discovers that a shared Sprint-00 contract (or any reviewed
cross-sprint interface) genuinely must change, the master plan requires:

1. Document the exact change in this directory (one file per request).
2. Avoid editing another sprint's owned files unless necessary for a
   build/test fix.
3. Keep any unavoidable cross-file change minimal and list it explicitly in
   the sprint report.

## Request file format

Each request must state:

- **ICR id** (e.g., `ICR-2025-001`), date, originating sprint/branch.
- **Affected interface(s)**: schema names, module paths, enum values.
- **Exact change**: before/after shapes, new enum values, new/removed fields.
- **Rationale**: which sprint requirement cannot be met otherwise.
- **Affected sprints**: everything that consumes the interface.
- **Migration**: how existing records/consumers are affected; version bump
  of the schema family if incompatible.
- **Review status**: pending / approved / rejected.

No requests exist at Sprint 00 completion.
