import type {
  CommitMessage,
  FileChanges,
} from "./github/graphql/generated/types.js";
import type { GitHubClient } from "./github/graphql/queries.js";

import type { Logger } from "./logging.js";

export type CommitFilesResult = {
  refId: string | null;
};

export type GitBase =
  | {
      branch: string;
    }
  | {
      tag: string;
    }
  | {
      commit: string;
    };

export interface CommitFilesBasedArgs {
  octokit: GitHubClient;
  owner: string;
  repo?: string;
  /** @deprecated use {@link repo} instead */
  repository?: string;
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

export interface CommitFilesSharedArgsWithBase extends CommitFilesBasedArgs {
  /**
   * The current branch, tag or commit that the new branch should be based on.
   */
  base: GitBase;
}

export interface CommitFilesFromBase64Args
  extends CommitFilesSharedArgsWithBase {
  fileChanges: FileChanges;
}

export interface CommitFilesFromBuffersArgs
  extends CommitFilesSharedArgsWithBase {
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

export interface CommitFilesFromDirectoryArgs
  extends CommitFilesSharedArgsWithBase {
  /**
   * The directory to consider the root of the repository when calculating
   * file paths
   */
  workingDirectory?: string;
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

export interface CommitChangesFromRepoArgs extends CommitFilesBasedArgs {
  /**
   * The base commit to build your changes on-top of.
   *
   * By default, this commit will be the HEAD of the local repository,
   * meaning that if any commits have been made locally and not pushed,
   * this command will fail.
   *
   * To include all changes, this should be set to a commit that is known
   * to be in the remote repository (such as the default branch).
   *
   * If you want to base the changes on a different commit to one checked out,
   * make sure that you also pull this commit from the remote.
   *
   * @default HEAD
   */
  base?: {
    commit: string;
  };
  /**
   * The root of the repository.
   *
   * When unspecified, the root of the repository will be found by recursively
   * searching for the `.git` directory from the current working directory.
   */
  repoDirectory?: string;
  /**
   * The starting directory to recurse from when detecting changed files.
   *
   * Useful for monorepos where you want to add files from a specific directory only.
   *
   * Defaults to resolved value of {@link repoDirectory},
   * which will add all changed files in the repository.
   */
  addFromDirectory?: string;
  /**
   * An optional function that can be used to filter which files are included
   * in the commit. True should be returned for files that should be included.
   *
   * By default, all files are included.
   */
  filterFiles?: (file: string) => boolean;
}
