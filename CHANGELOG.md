# @changesets/ghcommit

## 2.0.0

### Major Changes

- [#41](https://github.com/changesets/ghcommit/pull/41) [`295d847`](https://github.com/changesets/ghcommit/commit/295d84746faa73afb64ee2cfead1be53c66ec526) Thanks [@s0](https://github.com/s0)! - Make `repo` argument required,
  and remove the `repository` argument which was deprecated
  and previously could be used in its place.

- [#40](https://github.com/changesets/ghcommit/pull/40) [`4117e39`](https://github.com/changesets/ghcommit/commit/4117e398eafae4cdf42837e1240e140dbc6592db) Thanks [@s0](https://github.com/s0)! - Refactor & clean up options for multiple functions

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

## 1.4.0

### Minor Changes

- [#37](https://github.com/changesets/ghcommit/pull/37) [`21c9eaf`](https://github.com/changesets/ghcommit/commit/21c9eafeb82a81c1e08f7930e75e3053cb7d4196) Thanks [@s0](https://github.com/s0)! - Throw an error when executable files are encountered

- [#33](https://github.com/changesets/ghcommit/pull/33) [`92be707`](https://github.com/changesets/ghcommit/commit/92be707102786c84602733a18de9f478d8b95f28) Thanks [@s0](https://github.com/s0)! - Introduce `filterFiles` argument for `commitChangesFromRepo`

  Allow for a custom function to be specified to filter which files should be
  included in the commit

- [#33](https://github.com/changesets/ghcommit/pull/33) [`92be707`](https://github.com/changesets/ghcommit/commit/92be707102786c84602733a18de9f478d8b95f28) Thanks [@s0](https://github.com/s0)! - Introduce `addFromDirectory` option for `commitChangesFromRepo` to allow users to
  specify a subdirectory of the git repository that should be used to add files
  from, rather then adding all changed files.

  This is useful when trying to emulate the behavior of running `git add .`
  from a subdirectory of the repository.

- [#33](https://github.com/changesets/ghcommit/pull/33) [`92be707`](https://github.com/changesets/ghcommit/commit/92be707102786c84602733a18de9f478d8b95f28) Thanks [@s0](https://github.com/s0)! - Automatically find root in `commitChangesFromRepo`
  when `repoDirectory` is unspecified.

  While this does result in a behavioral change for an existing argument,
  it's considered non-breaking as before `commitChangesFromRepo` would just not
  work when run from a subdirectory of a repo when `repoDirectory` was not
  specified.

### Patch Changes

- [#34](https://github.com/changesets/ghcommit/pull/34) [`231d400`](https://github.com/changesets/ghcommit/commit/231d400d0a0fbfb102cb5a8bb6fac466babed12e) Thanks [@h3rmanj](https://github.com/h3rmanj)! - More gracefully handle symlinks, and ignore them when included in .gitignore

## 1.3.1

### Patch Changes

- [#30](https://github.com/changesets/ghcommit/pull/30) [`8954e86`](https://github.com/changesets/ghcommit/commit/8954e86d778b37dfacf7539cdfadd7a7bdcfbfcf) Thanks [@s0](https://github.com/s0)! - Re-enable provenance when publishing to NPM

- [#27](https://github.com/changesets/ghcommit/pull/27) [`d8800b2`](https://github.com/changesets/ghcommit/commit/d8800b2127d059771863c06d975b43f681d87a16) Thanks [@dependabot](https://github.com/apps/dependabot)! - Bump dependencies

## 1.3.0

### Minor Changes

- 1324104: Migrating package to @changesets namespace

  Ownership of the repository has moved from https://github.com/s0/ghcommit
  to https://github.com/changesets/ghcommit. As part of this we're also moving the
  NPM package to the @changesets namespace. No functional changes have happened,
  so this can be a drop-in replacement for `@s0/ghcommit`.

# @s0/ghcommit

## 1.2.1

### Patch Changes

- 85ec677: Address issue with Ref HEAD not found

## 1.2.0

### Minor Changes

- a704fb3: Rename repository argument to repo, and deprecate old argument
- a704fb3: Allow message to be specified as single string

## 1.1.0

### Minor Changes

- 642fb77: Allow for base commit to be specified with commitChangesFromRepo

## 1.0.0

### Major Changes

- be55175: First major release

## 0.1.0

### Minor Changes

- 804978f: Initial publish from CI
