import { exec } from "tinyexec";
import { beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { commitFilesFromBase64 } from "../../src/core.ts";
import {
  createRefMutation,
  getRepositoryMetadata,
} from "../../src/github/graphql/queries.ts";
import type { CommitFilesFromBase64Args } from "../../src/interface.ts";
import {
  deleteBranch,
  expectBranchDoesNotExist,
  expectBranchHasFile,
  expectBranchHasTree,
  expectBranchNotHaveFile,
  expectParentHasOid,
  getOid,
  getTempBranch,
  octokit,
  owner,
  repo,
  waitForGitHubToBeReady,
} from "./utils.ts";

// NOTE: These tests create and update actual branches in the repo. Add tests here sparingly and
// ensure the code doesn't affect the active repo branches.

const BASIC_FILE_CHANGES_PATH = "foo.txt";
const BASIC_FILE_BUFFER = Buffer.alloc(1024, "Hello, world!");
const BASIC_FILE_CHANGES_OID = getOid(BASIC_FILE_BUFFER);
const BASIC_FILE_CONTENTS = BASIC_FILE_BUFFER.toString("base64");
const BASIC_FILE_CHANGES = {
  additions: [
    {
      path: BASIC_FILE_CHANGES_PATH,
      contents: BASIC_FILE_CONTENTS,
    },
  ],
};

// Match branch name as in core.ts
function getInternalTempBranch(name: string) {
  return `changesets-ghcommit-temp/${name}`;
}

describe("commitFilesFromBase64", () => {
  let repositoryId: string;
  let testTargetCommit: string;

  /**
   * For tests, important that this commit is not an ancestor of TEST_TARGET_COMMIT,
   * to ensure that non-fast-forward pushes are tested
   */
  let testTargetCommit2: string;
  let testTargetTree2: string;

  async function commitFilesFromBase64WithDefaults(
    args: Omit<
      CommitFilesFromBase64Args,
      "octokit" | "owner" | "repo" | "message" | "base"
    > &
      Partial<Pick<CommitFilesFromBase64Args, "base">>,
  ) {
    return await commitFilesFromBase64({
      octokit,
      owner,
      repo,
      message: "Test commit",
      ...args,
      // Allow overrides
      base: args.base ?? {
        commit: testTargetCommit,
      },
    });
  }

  beforeAll(async () => {
    const response = await getRepositoryMetadata(octokit, {
      owner,
      repo,
      baseRef: "HEAD",
      targetRef: "HEAD",
    });
    if (!response?.id) {
      throw new Error("Repository not found");
    }
    repositoryId = response.id;

    // Get recent 2 commits to perform tests on
    const logOutput = await exec(
      "git",
      ["log", "-n", "2", "--pretty=format:%H %T"],
      { nodeOptions: { cwd: process.cwd() } },
    );
    const logs = logOutput.stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [oid, tree] = line.split(" ");
        return { oid, tree };
      });

    testTargetCommit = logs[1]?.oid ?? "N/A";
    testTargetCommit2 = logs[0]?.oid ?? "N/A";
    testTargetTree2 = logs[0]?.tree ?? "N/A";
  });

  it("can commit files", async () => {
    const branch = getTempBranch("basic-commit");
    onTestFinished(() => deleteBranch(branch));

    const buffers = {
      newFile: Buffer.from("Hello, world!"),
      updated: Buffer.from("Hello, world!"),
      nested: Buffer.from("Hello, world!"),
    };

    await commitFilesFromBase64WithDefaults({
      branch,
      fileChanges: {
        additions: [
          {
            path: "new-file.txt",
            contents: buffers.newFile.toString("base64"),
          },
          {
            path: "README.md",
            contents: buffers.updated.toString("base64"),
          },
          {
            path: "tests/file.txt",
            contents: buffers.nested.toString("base64"),
          },
        ],
        deletions: [{ path: "CHANGELOG.md" }],
      },
    });

    await waitForGitHubToBeReady();

    await expectBranchHasFile({
      branch,
      filePath: "new-file.txt",
      fileOid: getOid(buffers.newFile),
    });
    await expectBranchHasFile({
      branch,
      filePath: "README.md",
      fileOid: getOid(buffers.updated),
    });
    await expectBranchHasFile({
      branch,
      filePath: "tests/file.txt",
      fileOid: getOid(buffers.nested),
    });
    await expectBranchNotHaveFile({ branch, filePath: "CHANGELOG.md" });
  });

  it("can commit large file sizes", async () => {
    const branch = getTempBranch("file-size");
    onTestFinished(() => deleteBranch(branch));

    const buffers = {
      "1KiB": Buffer.alloc(1024, "Hello, world!"),
      "1MiB": Buffer.alloc(1024 * 1024, "Hello, world!"),
      "10MiB": Buffer.alloc(1024 * 1024 * 10, "Hello, world!"),
    };

    await commitFilesFromBase64WithDefaults({
      branch,
      fileChanges: {
        additions: Object.entries(buffers).map(([sizeName, buffer]) => ({
          path: `${sizeName}.txt`,
          contents: buffer.toString("base64"),
        })),
      },
    });

    await waitForGitHubToBeReady();

    for (const [sizeName, buffer] of Object.entries(buffers)) {
      await expectBranchHasFile({
        branch,
        filePath: `${sizeName}.txt`,
        fileOid: getOid(buffer),
      });
    }
  });

  it("can commit using branch as a base", async () => {
    const branch = getTempBranch("branch-base");
    onTestFinished(() => deleteBranch(branch));

    await commitFilesFromBase64WithDefaults({
      branch,
      base: {
        branch: "main",
      },
      fileChanges: BASIC_FILE_CHANGES,
    });

    await waitForGitHubToBeReady();

    // Don't test tree for this one as it will change over time / be unstable
    await expectBranchHasFile({
      branch,
      filePath: BASIC_FILE_CHANGES_PATH,
      fileOid: BASIC_FILE_CHANGES_OID,
    });
  });

  // oxlint-disable-next-line vitest/no-disabled-tests
  it.skip("can commit using tag as a base", async () => {
    const branch = getTempBranch("tag-base");
    onTestFinished(() => deleteBranch(branch));

    await commitFilesFromBase64WithDefaults({
      branch,
      base: {
        // for some reason the tag used here needs to have `.github/workflows` identical~ to the default branch
        // otherwise, GitHub rejects `createRef` with "Resource not accessible by integration" and reports missing `workflows=write` permission
        tag: "v1.4.0",
      },
      fileChanges: BASIC_FILE_CHANGES,
    });

    await waitForGitHubToBeReady();

    // Don't test tree for this one as it will change over time / be unstable
    await expectBranchHasFile({
      branch,
      filePath: BASIC_FILE_CHANGES_PATH,
      fileOid: BASIC_FILE_CHANGES_OID,
    });
  });

  it("can commit using commit as a base", async () => {
    const branch = getTempBranch("commit-base");
    onTestFinished(() => deleteBranch(branch));

    await commitFilesFromBase64WithDefaults({
      branch,
      base: {
        commit: testTargetCommit,
      },
      fileChanges: BASIC_FILE_CHANGES,
    });

    await waitForGitHubToBeReady();

    await expectBranchHasFile({
      branch,
      filePath: BASIC_FILE_CHANGES_PATH,
      fileOid: BASIC_FILE_CHANGES_OID,
    });
  });

  describe("existing branches", () => {
    it("can commit to existing branch when force is true", async () => {
      const branch = getTempBranch("existing-branch-force");
      const internalTempBranch = getInternalTempBranch(branch);
      onTestFinished(() => deleteBranch(branch));
      onTestFinished(() => deleteBranch(internalTempBranch, true));

      // Create an exiting branch
      await createRefMutation(octokit, {
        input: {
          repositoryId,
          name: `refs/heads/${branch}`,
          oid: testTargetCommit2,
        },
      });

      await commitFilesFromBase64WithDefaults({
        branch,
        fileChanges: BASIC_FILE_CHANGES,
        force: true,
      });

      await waitForGitHubToBeReady();

      await expectBranchHasFile({
        branch,
        filePath: BASIC_FILE_CHANGES_PATH,
        fileOid: BASIC_FILE_CHANGES_OID,
      });

      await expectParentHasOid({ branch, oid: testTargetCommit });
      await expectBranchDoesNotExist(internalTempBranch);
    });

    it("cleans up a pre-existing temporary branch when force is true", async () => {
      const branch = getTempBranch("existing-branch-force-existing-temp");
      const internalTempBranch = getInternalTempBranch(branch);
      onTestFinished(() => deleteBranch(branch));
      onTestFinished(() => deleteBranch(internalTempBranch, true));

      await createRefMutation(octokit, {
        input: {
          repositoryId,
          name: `refs/heads/${branch}`,
          oid: testTargetCommit2,
        },
      });

      await createRefMutation(octokit, {
        input: {
          repositoryId,
          name: `refs/heads/${internalTempBranch}`,
          oid: testTargetCommit2,
        },
      });

      await commitFilesFromBase64WithDefaults({
        branch,
        fileChanges: BASIC_FILE_CHANGES,
        force: true,
      });

      await waitForGitHubToBeReady();

      await expectBranchHasFile({
        branch,
        filePath: BASIC_FILE_CHANGES_PATH,
        fileOid: BASIC_FILE_CHANGES_OID,
      });

      await expectParentHasOid({ branch, oid: testTargetCommit });
      await expectBranchDoesNotExist(internalTempBranch);
    });

    it("cannot commit to existing branch when force is false", async () => {
      const branch = getTempBranch("existing-branch-no-force");
      onTestFinished(() => deleteBranch(branch));

      // Create an exiting branch
      await createRefMutation(octokit, {
        input: {
          repositoryId,
          name: `refs/heads/${branch}`,
          oid: testTargetCommit2,
        },
      });

      await waitForGitHubToBeReady();

      await expect(() =>
        commitFilesFromBase64WithDefaults({
          branch,
          fileChanges: BASIC_FILE_CHANGES,
        }),
      ).rejects.toThrow(
        `Branch ${branch} exists already and does not match base`,
      );

      await expectBranchHasTree({
        branch,
        treeOid: testTargetTree2,
      });
    });

    it("can commit to existing branch when force is false and target matches base", async () => {
      const branch = getTempBranch("existing-branch-matching-base");
      onTestFinished(() => deleteBranch(branch));

      // Create an exiting branch
      await createRefMutation(octokit, {
        input: {
          repositoryId,
          name: `refs/heads/${branch}`,
          oid: testTargetCommit,
        },
      });

      await waitForGitHubToBeReady();

      await commitFilesFromBase64WithDefaults({
        branch,
        fileChanges: BASIC_FILE_CHANGES,
      });

      await waitForGitHubToBeReady();

      await expectBranchHasFile({
        branch,
        filePath: BASIC_FILE_CHANGES_PATH,
        fileOid: BASIC_FILE_CHANGES_OID,
      });
    });

    it("can commit to same branch as base", async () => {
      const branch = getTempBranch("same-branch-as-base");
      onTestFinished(() => deleteBranch(branch));

      // Create an exiting branch
      await createRefMutation(octokit, {
        input: {
          repositoryId,
          name: `refs/heads/${branch}`,
          oid: testTargetCommit,
        },
      });

      await waitForGitHubToBeReady();

      await commitFilesFromBase64WithDefaults({
        branch,
        fileChanges: BASIC_FILE_CHANGES,
      });

      await waitForGitHubToBeReady();

      await expectBranchHasFile({
        branch,
        filePath: BASIC_FILE_CHANGES_PATH,
        fileOid: BASIC_FILE_CHANGES_OID,
      });
    });
  });
});
