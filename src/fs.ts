import { promises as fs } from "fs";
import * as path from "path";
import { commitFilesFromBase64 } from "./core.ts";
import type {
  CommitFilesFromBase64Args,
  CommitFilesFromDirectoryArgs,
  CommitFilesResult,
} from "./interface.ts";

export async function commitFilesFromDirectory({
  cwd,
  fileChanges,
  ...otherArgs
}: CommitFilesFromDirectoryArgs): Promise<CommitFilesResult> {
  return await commitFilesFromBase64({
    ...otherArgs,
    fileChanges: await normalizeFileChanges(fileChanges, cwd),
  });
}

// Exported for testing only
export async function normalizeFileChanges(
  fileChanges: CommitFilesFromDirectoryArgs["fileChanges"],
  cwd: string,
): Promise<CommitFilesFromBase64Args["fileChanges"]> {
  return {
    additions: fileChanges.additions
      ? await Promise.all(
          fileChanges.additions.map(async (a) => ({
            path: a,
            contents: await fs.readFile(path.join(cwd, a), "base64"),
          })),
        )
      : undefined,
    deletions: fileChanges.deletions?.map((d) => ({ path: d })),
  };
}
