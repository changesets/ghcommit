import fs from "node:fs/promises";
import path from "path";
import { exec } from "tinyexec";
import { commitChanges } from "./core.ts";
import type {
  CommitChangesOptions,
  CommitChangesSinceBaseOptions,
  CommitChangesResult,
} from "./types.ts";
import { resolveGitRef } from "./utils.ts";

/**
 * Commit file changes since a local git base (defaults to HEAD). This executes
 * the `git` command to determine the changes and then uses {@link commitChanges}
 * to commit them to the given branch.
 *
 * The default HEAD base includes all uncommitted changes since the last commit.
 * If previous commits have been made locally and not pushed, you need to set `base
 * to the last commit that is known to be in the remote repository.
 *
 * Works in Node.js only.
 */
export async function commitChangesSinceBase({
  cwd,
  filterFiles,
  ...otherArgs
}: CommitChangesSinceBaseOptions): Promise<CommitChangesResult> {
  cwd = path.resolve(cwd ?? process.cwd());

  const ref = resolveGitRef(otherArgs.base ?? { commit: "HEAD" });
  const refSha = await getShaForRef(cwd, ref);
  if (!refSha) {
    throw new Error(`Could not determine sha for ref ${ref}`);
  }

  return await commitChanges({
    ...otherArgs,
    fileChanges: await getFileChanges(cwd, refSha, filterFiles),
    base: {
      commit: refSha,
    },
  });
}

// Exported for testing only
export async function getFileChanges(
  cwd: string,
  ref: string,
  filterFiles?: CommitChangesSinceBaseOptions["filterFiles"],
): Promise<CommitChangesOptions["fileChanges"]> {
  const repoRoot = await findGitRoot(cwd);

  const additions: CommitChangesOptions["fileChanges"]["additions"] = [];
  const deletions: CommitChangesOptions["fileChanges"]["deletions"] = [];

  const addPath = async (filePath: string) => {
    if (filterFiles && !filterFiles(filePath)) return;

    const resolvedFilePath = path.join(repoRoot, filePath);
    const stat = await fs.lstat(resolvedFilePath);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Unexpected symlink at ${filePath}, GitHub API only supports files and directories. You may need to add this file to .gitignore`,
      );
    }
    const isFileExecutable = (stat.mode & 0o111) !== 0;
    if (isFileExecutable) {
      throw new Error(
        `Unexpected executable file at ${filePath}, GitHub API only supports non-executable files and directories. You may need to add this file to .gitignore`,
      );
    }

    additions.push({
      path: filePath,
      contents: await fs.readFile(resolvedFilePath, "base64"),
    });
  };

  const deletePath = (filePath: string) => {
    if (filterFiles && !filterFiles(filePath)) return;

    deletions.push({ path: filePath });
  };

  // `diffResult` returns all files that have changed since the ref, except untracked files.
  // `untrackedResult` returns the untracked files, treating as new additions.
  const [diffResult, untrackedResult] = await Promise.all([
    exec("git", ["diff", "--name-status", "--diff-filter=ACDMRT", ref], {
      throwOnError: true,
      nodeOptions: { cwd: repoRoot },
    }),
    exec("git", ["ls-files", "--others", "--exclude-standard"], {
      throwOnError: true,
      nodeOptions: { cwd: repoRoot },
    }),
  ]);

  for (const line of diffResult.stdout.trim().split("\n")) {
    if (!line) continue;
    const [status, ...paths] = line.split("\t");

    if (status.startsWith("R") || status.startsWith("C")) {
      const [oldPath, newPath] = paths;
      deletePath(oldPath);
      await addPath(newPath);
      continue;
    }

    const filePath = paths[0];
    if (status === "D") {
      deletePath(filePath);
    } else {
      await addPath(filePath);
    }
  }

  for (const filePath of untrackedResult.stdout.trim().split("\n")) {
    if (!filePath) continue;
    await addPath(filePath);
  }

  additions.sort((a, b) => (a.path > b.path ? 1 : -1));
  deletions.sort((a, b) => (a.path > b.path ? 1 : -1));

  return { additions, deletions };
}

async function getShaForRef(cwd: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", ref], {
      throwOnError: true,
      nodeOptions: { cwd },
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function findGitRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--git-dir"], {
      throwOnError: true,
      nodeOptions: { cwd },
    });
    return path.dirname(path.resolve(cwd, stdout.trim()));
  } catch {
    return cwd;
  }
}
