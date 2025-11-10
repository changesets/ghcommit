import { commitFilesFromBase64 } from "./core.js";
import { CommitFilesFromBuffersArgs, CommitFilesResult } from "./interface.js";

export const commitFilesFromBuffers = async ({
  fileChanges,
  ...otherArgs
}: CommitFilesFromBuffersArgs): Promise<CommitFilesResult> => {
  return commitFilesFromBase64({
    ...otherArgs,
    fileChanges: {
      additions: fileChanges.additions?.map(({ path, contents, mode }) => ({
        path,
        contents: contents.toString("base64"),
        mode,
      })),
      deletions: fileChanges.deletions?.map((path) => ({ path })),
    },
  });
};
