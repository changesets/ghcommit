import type {
  CommitMessage,
  FileChanges,
} from "./github/graphql/generated/types.ts";
import type { Octokit } from "./github/graphql/queries.ts";

export type GitRef = { branch: string } | { tag: string } | { commit: string };

export interface CommitChangesOptions {
  /**
   * The Octokit instance to use for making GitHub API requests. Requires APIs
   * from `@octokit/core`, `@octokit/plugin-rest-endpoint-methods`, and
   * `@octokit/plugin-paginate-rest`.
   */
  octokit: Octokit;
  /**
   * The owner of the repository.
   */
  owner: string;
  /**
   * The name of the repository.
   */
  repo: string;
  /**
   * The name of the branch to commit to.
   */
  branch: string;
  /**
   * The current branch, tag, or commit that the new branch should be based on.
   *
   * @example
   * { branch: "main" }
   * @example
   * { tag: "v1.0.0" }
   * @example
   * { commit: "abc123..." }
   */
  base: GitRef;
  /**
   * The files that are added, modified, or deleted in the commit. Added and
   * modified files should be in the `additions` array with their content as
   * base64-encoded strings. Deleted files should be in the `deletions` array
   * with their file paths.
   *
   * @example
   * {
   *   additions: [{ path: "file.txt", content: "SGVsbG8gd29ybGQ=" }]
   *   deletions: ["old-file.txt"]
   * }
   */
  fileChanges: FileChanges;
  /**
   * The commit message. If a string is passed, the first line will be used as
   * the headline, and the rest will be used as the body. An object can also be
   * passed to explicitly specify the headline and body.
   */
  message: string | CommitMessage;
  /**
   * If the branch exists but its HEAD does not match the given base, the commit
   * cannot be created as their histories have diverged. If this is set to true,
   * the commit will be force pushed to the branch instead, overwriting any
   * existing commits.
   */
  force?: boolean;
}

export interface CommitChangesResult {
  /**
   * The ref id of the created or update branch.
   */
  refId: string;
}

export interface CommitChangesSinceBaseOptions extends Omit<
  CommitChangesOptions,
  "base" | "fileChanges"
> {
  /**
   * The base branch, tag, or commit to determine the changes since then. The
   * commit form additionally accepts `HEAD` (and similar ref shorthands) instead
   * of the full commit SHA.
   *
   * The default is `{ commit: "HEAD" }`, which includes all uncommitted changes
   * since the last commit. If previous commits have been made locally and not
   * pushed, you need to set to the last commit that is known to be in the
   * remote repository.
   *
   * If you want to base the changes on a different branch, tag, or commit to
   * the one checked out, make sure that you have pulled those refs from the
   * remote repository.
   *
   * @default { commit: "HEAD" }
   */
  base?: GitRef;
  /**
   * The directory to execute git commands in. And any changes outside of this
   * directory (but within the repository) is ignored.
   */
  cwd: string;
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
