import { commitFilesFromBase64 } from "./core.js";
import type {
  CommitFilesFromBuffersArgs,
  CommitFilesResult,
} from "./interface.ts";

export const commitFilesFromBuffers = async ({
  fileChanges,
  ...otherArgs
}: CommitFilesFromBuffersArgs): Promise<CommitFilesResult> => {
  return commitFilesFromBase64({
    ...otherArgs,
    fileChanges: {
      additions: fileChanges.additions?.map(({ path, contents }) => ({
        path,
        contents: contents.toString("base64"),
      })),
      deletions: fileChanges.deletions?.map((path) => ({ path })),
    },
  });
};
