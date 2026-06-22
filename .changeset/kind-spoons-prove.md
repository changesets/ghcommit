---
"@changesets/ghcommit": major
---

Remove `recursivelyFindRoot` and make `cwd` optional for `commitChangesSinceBase`. Files will also not be filtered by `cwd` by default. To only commit files from a directory, use the `filterFiles` option instead.
