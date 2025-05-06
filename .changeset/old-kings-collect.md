---
"@changesets/ghcommit": minor
---

Automatically find root in `commitChangesFromRepo`
when `repoDirectory` is unspecified.

While this does result in a behavioral change for an existing argument,
it's considered non-breaking as before `commitChangesFromRepo` would just not
work when run from a subdirectory of a repo when `repoDirectory` was not
specified.
