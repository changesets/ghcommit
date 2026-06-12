import { commitFilesFromBase64 } from "./core.js";
import type {
  CommitFilesFromBase64Args,
  CommitFilesFromBuffersArgs,
  CommitFilesResult,
} from "./interface.ts";

export async function commitFilesFromBuffers({
  fileChanges,
  ...otherArgs
}: CommitFilesFromBuffersArgs): Promise<CommitFilesResult> {
  return await commitFilesFromBase64({
    ...otherArgs,
    fileChanges: normalizeFileChanges(fileChanges),
  });
}

// Exported for testing only
export function normalizeFileChanges(
  fileChanges: CommitFilesFromBuffersArgs["fileChanges"],
): CommitFilesFromBase64Args["fileChanges"] {
  return {
    additions: fileChanges.additions?.map((a) => ({
      path: a.path,
      contents: a.contents.toString("base64"),
    })),
    deletions: fileChanges.deletions?.map((d) => ({ path: d })),
  };
}
