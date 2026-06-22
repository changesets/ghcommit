---
"@changesets/ghcommit": major
---

Rename public APIs and export types. Note that the existing changelog may still reference the old names, but the new names should be used instead.

- `commitFilesFromBase64` -> `commitChanges`
- `commitChangesFromRepo` -> `commitChangesSinceBase`
