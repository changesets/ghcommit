---
"@changesets/ghcommit": minor
---

Improve create, update, and force update handling in `commitFilesFromBase64`:

- Correctly detect if the `base` is the same as `branch` by comparing their SHAs instead of names.
- Perform a normal update if the branch exists and the `base` and branch HEAD SHAs match, instead of always a force update if `force` is true.
- Always clean up created or existing temporary branches during force updates, even if it fails.
- Always return a non-nullable `refId` from `commitFilesFromBase64` (and consequently `commitChangesFromRepo`). If the commit fails, it'll throw an error instead, similar to existing parts of the implementation.
