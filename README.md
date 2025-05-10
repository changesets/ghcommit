# `@changesets/ghcommit`

[![View on NPM](https://badgen.net/npm/v/@changesets/ghcommit)](https://www.npmjs.com/package/@changesets/ghcommit)

NPM / TypeScript package to commit changes GitHub repositories using the GraphQL API.

## Why?

- **Simplified GPG Signing:**

  If you or your organisation has strict requirements
  around requiring signed commits (i.e. via Branch Protection or Repo Rulesets), then this can make integrating CI workflows or applications that are designed to make changes to your repos quite difficult. This is because you will need to manage your own GPG keys, assign them to machine accounts (which also means it doesn't work with GitHub Apps), and securely manage and rotate them.

  Instead of doing this, if you use the GitHub API to make changes to files (such as what happens when making changes to files directly in the web UI), then GitHub's internal GPG key is used, and commits are all signed and associated with the user of the access token that was used.

  (And this also works with GitHub Apps too, including the GitHub Actions app).

  ![](docs/verified.png)

  This library has primarily been designed for use in custom Node GitHub Actions, but can be used in any Node.js or JavaScript project that needs to directly modify files in GitHub repositories.

- **Simplified Git Config:**

  When performing git actions via the GitHub API, all actions are always attributed to the actor whose `GITHUB_TOKEN` is being used (whether an app, or user), and this information is reflected in the git committer and author. As such, it's no longer necessary (or even possible) to specify the commit author (name and email address).

  This simplifies the process of preparing your workflows for pushing changes, as you no longer need to configure the name and email address in git, and ensure they appropriately match any GPG keys used.

## Usage

### Installation

Install using your favourite package manager:

```
pnpm install @changesets/ghcommit
```

### Usage in github actions

All functions in this library that interact with the GitHub API require an octokit client that can execute GraphQL. If you are writing code that is designed to be run from within a GitHub Action, this can be done using the `@actions.github` library:

```ts
import { getOctokit } from "@actions/github";

const octokit = getOctokit(process.env.GITHUB_TOKEN);
```

### Importing specific modules

To allow for you to produce smaller bundle sizes, the functionality exposed in this package is grouped into specific modules that only import the packages required for their use. We recommend that you import from the specific modules rather than the root of the package.

## API

All the functions below accept a single object as its argument, and share the following base arguments:

<!-- TODO: point to some generated docs instead of including a code snippet -->

```ts
{
  octokit: GitHubClient;
  owner: string;
  repo: string;
  branch: string;
  /**
   * Push the commit even if the branch exists and does not match what was
   * specified as the base.
   */
  force?: boolean;
  /**
   * The commit message
   */
  message: string | CommitMessage;
  log?: Logger;
}
```

### `commitChangesFromRepo`

This function will take an existing repository on your filesystem (defaulting to the current working directory). This function is good to use if you're usually working within the context of a git repository, such as after running `@actions/checkout` in github actions.

In addition to `CommitFilesBasedArgs`, this function has the following arguments:

```ts
{
  /**
   * The directory used to find the repository root,
   * and search for changed files to commit.
   *
   * Any files that have been changed outside of this directory will be ignored.
   */
  cwd: string;
  /**
   * The base commit to build your changes on-top of
   *
   * @default HEAD
   */
  base?: {
    commit: string;
  };
  /**
   * Don't require {@link cwd} to be the root of the repository,
   * and use it as a starting point to recursively search for the `.git`
   * directory in parent directories.
   *
   * @default true
   */
  recursivelyFindRoot?: boolean;
  /**
   * An optional function that can be used to filter which files are included
   * in the commit. True should be returned for files that should be included.
   *
   * By default, all files are included.
   */
  filterFiles?: (file: string) => boolean;
}
```

Example:

```ts
import { context, getOctokit } from "@actions/github";
import { commitChangesFromRepo } from "@changesets/ghcommit/git";

const octokit = getOctokit(process.env.GITHUB_TOKEN);

// Commit & push the files from the current directory
// e.g. if you're just using @ations/checkout
await commitChangesFromRepo({
  octokit,
  ...context.repo,
  branch: "new-branch-to-create",
  message: "[chore] do something",
  cwd: process.cwd(),
});

// Commit & push the files from a specific directory
// where we've cloned a repo, and made changes to files
await commitChangesFromRepo({
  octokit,
  owner: "my-org",
  repository: "my-repo",
  branch: "another-new-branch-to-create",
  message: "[chore] do something else\n\nsome more details",
  cwd: "/tmp/some-repo",
});

// Commit & push the files from the current directory,
// but ensure changes from any locally-made commits are also included
await commitChangesFromRepo({
  octokit,
  ...context.repo,
  branch: "another-new-branch-to-create",
  message: {
    headline: "[chore] do something else",
    body: "some more details",
  },
  cwd: process.cwd(),
  base: {
    // This will be the original sha from the workflow run,
    // even if we've made commits locally
    commit: context.sha,
  },
});
```

### `commitFilesFromDirectory`

This function will add or delete specific files from a repository's branch based on files found on the local filesystem. This is good to use when there are specific files that need to be updated on a branch, or if many changes may have been made locally, but only some files need to be pushed.

In addition to `CommitFilesBasedArgs`, this function has the following arguments:

```ts
{
  /**
   * The current branch, tag or commit that the new branch should be based on.
   */
  base: GitBase;
  /**
   * The directory to consider the root of the repository when calculating
   * file paths
   */
  cwd: string;
  /**
   * The file paths, relative to {@link workingDirectory},
   * to add or delete from the branch on GitHub.
   */
  fileChanges: {
    /** File paths, relative to {@link workingDirectory}, to remove from the repo. */
    additions?: string[];
    /** File paths, relative to the repository root, to remove from the repo. */
    deletions?: string[];
  };
}
```

Example:

```ts
import { context, getOctokit } from "@actions/github";
import { commitFilesFromDirectory } from "@changesets/ghcommit/fs";

const octokit = getOctokit(process.env.GITHUB_TOKEN);

// Commit the changes to package.json and package-lock.json
// based on the main branch
await commitFilesFromDirectory({
  octokit,
  ...context.repo,
  branch: "new-branch-to-create",
  message: "[chore] do something",
  base: {
    branch: "main",
  },
  cwd: "foo/bar",
  fileChanges: {
    additions: ["package-lock.json", "package.json"],
  },
});

// Push just the index.html file to a new branch called docs, based off the tag v1.0.0
await commitFilesFromDirectory({
  octokit,
  ...context.repo,
  branch: "docs",
  message: "[chore] do something",
  force: true, // Overwrite any existing branch
  base: {
    tag: "v1.0.0",
  },
  cwd: "some-dir",
  fileChanges: {
    additions: ["index.html"],
  },
});
```

### `commitFilesFromBuffers`

This function will add or delete specific files from a repository's branch based on Node.js `Buffers` that can be any binary data in memory. This is useful for when you want to make changes to a repository / branch without cloning a repo or interacting with a filesystem.

In addition to `CommitFilesBasedArgs`, this function has the following arguments:

```ts
{
  /**
   * The current branch, tag or commit that the new branch should be based on.
   */
  base: GitBase;
  /**
   * The file changes, relative to the repository root, to make to the specified branch.
   */
  fileChanges: {
    additions?: Array<{
      path: string;
      contents: Buffer;
    }>;
    deletions?: string[];
  };
}
```

Example:

```ts
import { context, getOctokit } from "@actions/github";
import { commitFilesFromBuffers } from "@changesets/ghcommit/node";

const octokit = getOctokit(process.env.GITHUB_TOKEN);

// Add a file called hello-world
await commitFilesFromBuffers({
  octokit,
  ...context.repo,
  branch: "new-branch-to-create",
  message: "[chore] do something",
  base: {
    branch: "main",
  },
  fileChanges: {
    additions: [
      {
        path: "hello/world.txt",
        contents: Buffer.alloc(1024, "Hello, world!"),
      },
    ],
  },
});
```

## Known Limitations

Due to using the GitHub API to make changes to repository contents,
there are some things it's not possible to commit,
and where using the Git CLI is still required.

- Executable files
- Symbolic Links
- Submodule changes

## Other Tools / Alternatives

- [planetscale/ghcommit](https://github.com/planetscale/ghcommit) - Go library for committing to GitHub using graphql
- [planetscale/ghcommit-action](https://github.com/planetscale/ghcommit-action) - GitHub Action to detect file changes and commit using the above library
