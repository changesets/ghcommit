---
"@changesets/ghcommit": major
---

Refactor & clean up options for multiple functions

- For `commitFilesFromDirectory`:
  - Rename `workingDirectory` to `cwd` for consistency across repos,
    and utils like `exec`
  - Make `cwd` a required argument
- For `commitChangesFromRepo`:
  - Merge `repoDirectory` and `addFromDirectory` into a single required argument
    `cwd`. This folder will now both be used to filter which files are added,
    and to find the root of the repository.
  - Introduce `recursivelyFindRoot` option (default: `true`),
    to optionally search for the root of the repository,
    by checking for existence of `.git` directory in parent directories,
    starting from `cwd`.

This effectively removes all usage of process.cwd() within the package,
instead requiring all usage to be very explicit with specifying paths.
