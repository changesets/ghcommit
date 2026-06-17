# @changesets/ghcommit

## 3.0.0-next.0

### Major Changes

- [#91](https://github.com/changesets/ghcommit/pull/91) [`9ac746d`](https://github.com/changesets/ghcommit/commit/9ac746d10c551f0e167aa88e87346378860a8270) Thanks [@bluwy](https://github.com/bluwy)! - Remove `queries` export from index. You should not rely on these queries as stable APIs.

- [#89](https://github.com/changesets/ghcommit/pull/89) [`e34689e`](https://github.com/changesets/ghcommit/commit/e34689e5f5a9334fcae2c714655fc4a0d1ccf154) Thanks [@bluwy](https://github.com/bluwy)! - Add `"engines"` field for explicit node version support. The supported node versions are `^22.11 || ^24 || >=26`.

- [#109](https://github.com/changesets/ghcommit/pull/109) [`203f0b7`](https://github.com/changesets/ghcommit/commit/203f0b795d58f74532abe328dda815489cb215ba) Thanks [@bluwy](https://github.com/bluwy)! - Removed the `commitFilesFromBuffers` and `commitFilesFromDirectory` APIs. These APIs were simple wrappers over the core `commitChangesFromBase64` API, which should be used instead. Read the file and pass the base64-encoded content to `commitChangesFromBase64` `fileChanges` directly. For example:
  - `Buffer.from("hello world").toString("base64")`
  - `await fs.readFile("path/to/file", "base64")`

- [#88](https://github.com/changesets/ghcommit/pull/88) [`19ea73a`](https://github.com/changesets/ghcommit/commit/19ea73a1643cba9fd8de3583c895f1d95725cd01) Thanks [@bluwy](https://github.com/bluwy)! - Publish code as ESM only

- [#109](https://github.com/changesets/ghcommit/pull/109) [`203f0b7`](https://github.com/changesets/ghcommit/commit/203f0b795d58f74532abe328dda815489cb215ba) Thanks [@bluwy](https://github.com/bluwy)! - Removed all subpath exports. All APIs should be imported from root, e.g. `import { commitChangesFromRepo } from "@changesets/ghcommit"`.

- [#110](https://github.com/changesets/ghcommit/pull/110) [`ead1e55`](https://github.com/changesets/ghcommit/commit/ead1e55ab4256f5bd73f41f751e5d23166b57b12) Thanks [@bluwy](https://github.com/bluwy)! - Remove `log` argument from APIs. If you need to debug the package, use breakpoints or manually add logs in the package code.

### Minor Changes

- [#108](https://github.com/changesets/ghcommit/pull/108) [`8b5585d`](https://github.com/changesets/ghcommit/commit/8b5585d61175b3adec43335cfae7e3160cb9e525) Thanks [@bluwy](https://github.com/bluwy)! - Replace `isomorphic-git` with direct `git` command calls to get the file changes since a given ref

## 2.1.1

### Patch Changes

- [#81](https://github.com/changesets/ghcommit/pull/81) [`b425407`](https://github.com/changesets/ghcommit/commit/b425407fb483a6d7ce196614ef6c37142843bd43) Thanks [@Andarist](https://github.com/Andarist)! - Fixed an issue that caused GitHub types being bundled into the package and thus creating type incompatibilities in the dependent projects.

## 2.1.0

### Minor Changes

- [#70](https://github.com/changesets/ghcommit/pull/70) [`9f3d31c`](https://github.com/changesets/ghcommit/commit/9f3d31c91aada92e83efe99986f8632b16196e5b) Thanks [@Andarist](https://github.com/Andarist)! - Improve force-push handling so updating an existing branch no longer temporarily resets the target branch to the base commit, avoiding cases where GitHub closes open pull requests during the update.

## 2.0.1

### Patch Changes

- [#46](https://github.com/changesets/ghcommit/pull/46) [`d12678c`](https://github.com/changesets/ghcommit/commit/d12678cc90c7ba6d1cfe0ad673bb320f0eba0488) Thanks [@Andarist](https://github.com/Andarist)! - Don't error on already committed symlinks and executables that stay untouched

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
