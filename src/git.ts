import { promises as fs } from "fs";
import git from "isomorphic-git";
import { commitFilesFromBuffers } from "./node";
import {
  CommitChangesFromRepoArgs,
  CommitFilesFromBuffersArgs,
  CommitFilesResult,
} from "./interface";

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
