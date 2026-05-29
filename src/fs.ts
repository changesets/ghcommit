import { promises as fs } from "fs";
import * as path from "path";
import type { FileAddition } from "./github/graphql/generated/types.ts";
import type {
  CommitFilesFromDirectoryArgs,
  CommitFilesResult,
} from "./interface.ts";
import { commitFilesFromBuffers } from "./node.ts";

export const commitFilesFromDirectory = async ({
  cwd,
  fileChanges,
  ...otherArgs
}: CommitFilesFromDirectoryArgs): Promise<CommitFilesResult> => {
  const additions: FileAddition[] = await Promise.all(
    (fileChanges.additions || []).map(async (p) => {
      return {
        path: p,
        contents: await fs.readFile(path.join(cwd, p)),
      };
    }),
  );

  return commitFilesFromBuffers({
    ...otherArgs,
    fileChanges: {
      additions,
      deletions: fileChanges.deletions,
    },
  });
};
