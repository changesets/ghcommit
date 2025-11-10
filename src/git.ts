import { promises as fs } from "fs";
import git from "isomorphic-git";
import { commitFilesFromBuffers } from "./node";
import {
  CommitChangesFromRepoArgs,
  CommitFilesFromBuffersArgs,
  CommitFilesResult,
} from "./interface";
import { relative, resolve } from "path";

/**
 * @see https://isomorphic-git.org/docs/en/walk#walkerentry-mode
 */
const GIT_FILE_MODES = {
  directory: 0o40000,
  file: 0o100644,
  executableFile: 0o100755,
  symlink: 0o120000,
} as const;

/**
 * Convert git numeric mode to string mode for GitHub API
 * Returns the octal representation as a string (e.g., "100644", "100755")
 */
const convertGitModeToApiMode = (mode: number): string => {
  // Convert the numeric mode to its octal string representation
  // Git modes are stored as octal numbers, so we convert to octal string
  return mode.toString(8);
};

export const commitChangesFromRepo = async ({
  base,
  cwd: workingDirectory,
  recursivelyFindRoot = true,
  filterFiles,
  log,
  ...otherArgs
}: CommitChangesFromRepoArgs): Promise<CommitFilesResult> => {
  const ref = base?.commit ?? "HEAD";
  const cwd = resolve(workingDirectory);
  const repoRoot = recursivelyFindRoot
    ? await git.findRoot({ fs, filepath: cwd })
    : cwd;
  const gitLog = await git.log({
    fs,
    dir: repoRoot,
    ref,
    depth: 1,
  });

  const oid = gitLog[0]?.oid;

  if (!oid) {
    throw new Error(`Could not determine oid for ${ref}`);
  }

  /**
   * The directory to add files from. This is relative to the repository
   * root, and is used to filter files.
   */
  const relativeStartDirectory =
    cwd === repoRoot ? null : relative(repoRoot, cwd) + "/";

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
    dir: repoRoot,
    trees,
    map: async (filepath, [commit, workdir]) => {
      // Don't include ignored files
      if (
        await git.isIgnored({
          fs,
          dir: repoRoot,
          filepath,
        })
      ) {
        return null;
      }

      // Handle symlinks specially - oid() can fail for broken symlinks
      const workdirMode = await workdir?.mode();
      const commitMode = await commit?.mode();
      const isWorkdirSymlink = workdirMode === GIT_FILE_MODES.symlink;
      const isCommitSymlink = commitMode === GIT_FILE_MODES.symlink;

      let prevOid: string | undefined;
      let currentOid: string | undefined;

      // For symlinks, compute oid from the link target path
      if (isCommitSymlink) {
        prevOid = await commit?.oid().catch(() => undefined);
      } else {
        prevOid = await commit?.oid();
      }

      if (isWorkdirSymlink) {
        // For symlinks, we need to compute the oid ourselves since isomorphic-git
        // can fail for broken symlinks. We'll skip the oid check and always include the file.
        currentOid = undefined;
      } else {
        currentOid = await workdir?.oid();
      }

      // Don't include files that haven't changed, and exist in both trees
      // Skip this check for symlinks since oid computation can fail
      if (
        !isWorkdirSymlink &&
        !isCommitSymlink &&
        prevOid === currentOid &&
        !commit === !workdir
      ) {
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
      if (
        relativeStartDirectory &&
        !filepath.startsWith(relativeStartDirectory)
      ) {
        // Ignore files that are not in the specified directory
        return null;
      }
      if (filterFiles && !filterFiles(filepath)) {
        // Ignore out files that don't match any specified filter
        return null;
      }
      if (!workdir) {
        // File was deleted
        deletions.push(filepath);
        return null;
      } else {
        // File was added / updated
        const fileMode = await workdir.mode();
        const isSymlink = fileMode === GIT_FILE_MODES.symlink;

        let contents: Buffer;
        if (isSymlink) {
          // For symlinks, read the link target path using the filesystem
          // isomorphic-git's content() returns null for symlinks
          const symlinkPath = resolve(repoRoot, filepath);
          const linkTarget = await fs.readlink(symlinkPath);

          // Check if symlink target exists (resolve relative to symlink's directory)
          const { dirname } = await import("path");
          const targetPath = resolve(dirname(symlinkPath), linkTarget);
          try {
            await fs.access(targetPath);
          } catch {
            throw new Error(
              `Broken symlink detected: ${filepath} points to non-existent target ${linkTarget}`,
            );
          }

          contents = Buffer.from(linkTarget, "utf-8");
        } else {
          const arr = await workdir.content();
          if (!arr) {
            throw new Error(`Could not determine content of file ${filepath}`);
          }
          contents = Buffer.from(arr);
        }

        additions.push({
          path: filepath,
          contents,
          mode: convertGitModeToApiMode(fileMode ?? GIT_FILE_MODES.file),
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
