import { promises as fs } from "fs";
import git from "isomorphic-git";
import { commitFilesFromBuffers } from "./node";
import {
  CommitChangesFromRepoArgs,
  CommitFilesFromBuffersArgs,
  CommitFilesResult,
} from "./interface";

/**
 * @see https://isomorphic-git.org/docs/en/walk#walkerentry-mode
 */
const FILE_MODES = {
  directory: 0o40000,
  file: 0o100644,
  executableFile: 0o100755,
  symlink: 0o120000,
} as const;

export const commitChangesFromRepo = async ({
  base,
  repoDirectory = process.cwd(),
  log,
  ...otherArgs
}: CommitChangesFromRepoArgs): Promise<CommitFilesResult> => {
  const ref = base?.commit ?? "HEAD";
  const gitLog = await git.log({
    fs,
    dir: repoDirectory,
    ref,
    depth: 1,
  });

  const oid = gitLog[0]?.oid;

  if (!oid) {
    throw new Error(`Could not determine oid for ${ref}`);
  }

  // Determine changed files
  const trees = [git.TREE({ ref: oid }), git.WORKDIR()];
  const additions: CommitFilesFromBuffersArgs["fileChanges"]["additions"] = [];
  const deletions: CommitFilesFromBuffersArgs["fileChanges"]["deletions"] = [];
  const fileChanges = {
    additions,
    deletions,
  };
  await git.walk({
    fs,
    dir: repoDirectory,
    trees,
    map: async (filepath, [commit, workdir]) => {
      // Don't include ignored files
      if (
        await git.isIgnored({
          fs,
          dir: repoDirectory,
          filepath,
        })
      ) {
        return null;
      }
      if (
        (await commit?.mode()) === FILE_MODES.symlink ||
        (await workdir?.mode()) === FILE_MODES.symlink
      ) {
        throw new Error(
          `Unexpected symlink at ${filepath}, GitHub API only supports files and directories. You may need to add this file to .gitignore`,
        );
      }
      if ((await workdir?.mode()) === FILE_MODES.executableFile) {
        throw new Error(
          `Unexpected executable file at ${filepath}, GitHub API only supports non-executable files and directories. You may need to add this file to .gitignore`,
        );
      }
      const prevOid = await commit?.oid();
      const currentOid = await workdir?.oid();
      // Don't include files that haven't changed, and exist in both trees
      if (prevOid === currentOid && !commit === !workdir) {
        return null;
      }
      // Iterate through anything that may be a directory in either the
      // current commit or the working directory
      if (
        (await commit?.type()) === "tree" ||
        (await workdir?.type()) === "tree"
      ) {
        // Iterate through these directories
        return true;
      }
      if (!workdir) {
        // File was deleted
        deletions.push(filepath);
        return null;
      } else {
        // File was added / updated
        const arr = await workdir.content();
        if (!arr) {
          throw new Error(`Could not determine content of file ${filepath}`);
        }
        additions.push({
          path: filepath,
          contents: Buffer.from(arr),
        });
      }
      return true;
    },
  });

  return commitFilesFromBuffers({
    ...otherArgs,
    fileChanges,
    log,
    base: {
      commit: oid,
    },
  });
};
