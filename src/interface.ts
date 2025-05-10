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
  cwd: string;
  /**
   * The file paths, relative to {@link cwd},
   * to add or delete from the branch on GitHub.
   */
  fileChanges: {
    /** File paths, relative to {@link cwd}, to remove from the repo. */
    additions?: string[];
    /** File paths, relative to the repository root, to remove from the repo. */
    deletions?: string[];
  };
}

export interface CommitChangesFromRepoArgs extends CommitFilesBasedArgs {
  /**
   * The directory used to find the repository root,
   * and search for changed files to commit.
   *
   * Any files that have been changed outside of this directory will be ignored.
   */
  cwd: string;
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
