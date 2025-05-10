import * as path from "path";
import { promises as fs } from "fs";
import { getOctokit } from "@actions/github";

import { commitFilesFromDirectory } from "../../fs.js";
import {
  ENV,
  REPO,
  ROOT_TEMP_DIRECTORY,
  ROOT_TEST_BRANCH_PREFIX,
  log,
} from "./env.js";
import { deleteBranches } from "./util.js";

const octokit = getOctokit(ENV.GITHUB_TOKEN);

const TEST_BRANCHES = {
  COMMIT_FILE: `${ROOT_TEST_BRANCH_PREFIX}-fs-commit-file`,
} as const;

describe("fs", () => {
  describe("commitFilesFromDirectory", () => {
    it("should commit a file", async () => {
      // Create test directory
      await fs.mkdir(ROOT_TEMP_DIRECTORY, { recursive: true });
      const tmpDir = await fs.mkdtemp(path.join(ROOT_TEMP_DIRECTORY, "test-"));
      await fs.writeFile(path.join(tmpDir, "foo.txt"), "Hello, world!");

      await commitFilesFromDirectory({
        octokit,
        ...REPO,
        branch: TEST_BRANCHES.COMMIT_FILE,
        base: {
          branch: "main",
        },
        message: {
          headline: "Test commit",
          body: "This is a test commit",
        },
        cwd: tmpDir,
        fileChanges: {
          additions: ["foo.txt"],
        },
        log,
      });
    });
  });

  afterAll(async () => {
    console.info("Cleaning up test branches");

    await deleteBranches(octokit, Object.values(TEST_BRANCHES));
  });
});
