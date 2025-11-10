import { promises as fs } from "fs";
import * as path from "path";
import { commitFilesFromBuffers } from "./node.js";
import {
  CommitFilesFromDirectoryArgs,
  CommitFilesResult,
} from "./interface.js";

// File type constants from Node.js fs.constants
const S_IFMT = 0o170000; // File type mask
const S_IFREG = 0o100000; // Regular file
const S_IFDIR = 0o040000; // Directory
const S_IFLNK = 0o120000; // Symbolic link

/**
 * Convert filesystem mode to git mode string
 * Maps Unix file mode to git's internal mode representation
 */
const getFileModeFromStats = (mode: number): string => {
  const fileType = mode & S_IFMT;

  if (fileType === S_IFLNK) {
    // Symbolic link
    return "120000";
  }

  if (fileType === S_IFDIR) {
    // Directory
    return "040000";
  }

  if (fileType === S_IFREG) {
    // Regular file - check if executable
    const isExecutable = (mode & 0o111) !== 0;
    return isExecutable ? "100755" : "100644";
  }

  // Default to regular file for unknown types
  return "100644";
};

export const commitFilesFromDirectory = async ({
  cwd,
  fileChanges,
  ...otherArgs
}: CommitFilesFromDirectoryArgs): Promise<CommitFilesResult> => {
  const additions = await Promise.all(
    (fileChanges.additions || []).map(async (item) => {
      // Handle both string paths and objects with path and optional mode
      const filePath = typeof item === "string" ? item : item.path;
      const explicitMode = typeof item === "object" ? item.mode : undefined;

      const fullPath = path.join(cwd, filePath);
      // Use lstat to not follow symlinks
      const stats = explicitMode ? null : await fs.lstat(fullPath);

      // Determine mode
      const mode =
        explicitMode || (stats ? getFileModeFromStats(stats.mode) : "100644");

      // For symlinks, read the link target; otherwise read file contents
      let contents: Buffer;
      if (stats?.isSymbolicLink()) {
        // For symlinks, the content is the target path
        const linkTarget = await fs.readlink(fullPath);
        contents = Buffer.from(linkTarget, "utf-8");
      } else {
        contents = await fs.readFile(fullPath);
      }

      return {
        path: filePath,
        contents,
        mode,
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
