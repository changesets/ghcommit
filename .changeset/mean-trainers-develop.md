---
"@changesets/ghcommit": minor
---

Introduce `addFromDirectory` option for `commitChangesFromRepo` to allow users to
specify a subdirectory of the git repository that should be used to add files
from, rather then adding all changed files.

This is useful when trying to emulate the behavior of running `git add .`
from a subdirectory of the repository.
