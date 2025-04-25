import fs from "fs";
import path from "path";
import {
  ENV,
  REPO,
  ROOT_TEMP_DIRECTORY,
  ROOT_TEST_BRANCH_PREFIX,
  log,
} from "./env";
import { execFile } from "child_process";
import { getOctokit } from "@actions/github";
import { commitChangesFromRepo } from "../../git";
import { getRefTreeQuery } from "../../github/graphql/queries";
import { deleteBranches, waitForGitHubToBeReady } from "./util";
import git from "isomorphic-git";

const octokit = getOctokit(ENV.GITHUB_TOKEN);

const TEST_BRANCH_PREFIX = `${ROOT_TEST_BRANCH_PREFIX}-git`;

const expectBranchHasFile = async ({
  branch,
  path,
  oid,
}: {
  branch: string;
  path: string;
  oid: string | null;
}) => {
  if (oid === null) {
    expect(() =>
      getRefTreeQuery(octokit, {
        ...REPO,
        ref: `refs/heads/${branch}`,
        path,
      }),
    ).rejects.toThrow("Could not resolve file for path");
    return;
  }
  const ref = (
    await getRefTreeQuery(octokit, {
      ...REPO,
      ref: `refs/heads/${branch}`,
      path,
    })
  ).repository?.ref?.target;

  if (!ref) {
    throw new Error("Unexpected missing ref");
  }

  if ("tree" in ref) {
    expect(ref.file?.oid ?? null).toEqual(oid);
  } else {
    throw new Error("Expected ref to have a tree");
  }
};

const expectParentHasOid = async ({
  branch,
  oid,
}: {
  branch: string;
  oid: string;
}) => {
  const commit = (
    await getRefTreeQuery(octokit, {
      ...REPO,
      ref: `refs/heads/${branch}`,
      path: "README.md",
    })
  ).repository?.ref?.target;

  if (!commit || !("parents" in commit)) {
    throw new Error("Expected commit to have a parent");
  }

  expect(commit.parents.nodes).toEqual([{ oid }]);
};

const makeFileChanges = async (repoDirectory: string) => {
  // Update an existing file
  await fs.promises.writeFile(
    path.join(repoDirectory, "LICENSE"),
    "This is a new license",
  );
  // Remove a file
  await fs.promises.rm(path.join(repoDirectory, "package.json"));
  // Remove a file nested in a directory
  await fs.promises.rm(path.join(repoDirectory, "src", "index.ts"));
  // Add a new file
  await fs.promises.writeFile(
    path.join(repoDirectory, "new-file.txt"),
    "This is a new file",
  );
  // Add a new file nested in a directory
  await fs.promises.mkdir(path.join(repoDirectory, "nested"), {
    recursive: true,
  });
  await fs.promises.writeFile(
    path.join(repoDirectory, "nested", "nested-file.txt"),
    "This is a nested file",
  );
  // Add files that should be ignored
  await fs.promises.writeFile(
    path.join(repoDirectory, ".env"),
    "This file should be ignored",
  );
  await fs.promises.mkdir(path.join(repoDirectory, "coverage", "foo"), {
    recursive: true,
  });
  await fs.promises.writeFile(
    path.join(repoDirectory, "coverage", "foo", "bar"),
    "This file should be ignored",
  );
};

const makeFileChangeAssertions = async (branch: string) => {
  // Expect the deleted files to not exist
  await expectBranchHasFile({ branch, path: "package.json", oid: null });
  await expectBranchHasFile({ branch, path: "src/index.ts", oid: null });
  // Expect updated file to have new oid
  await expectBranchHasFile({
    branch,
    path: "LICENSE",
    oid: "8dd03bb8a1d83212f3667bd2eb8b92746120ab8f",
  });
  // Expect new files to have correct oid
  await expectBranchHasFile({
    branch,
    path: "new-file.txt",
    oid: "be5b944ff55ca7569cc2ae34c35b5bda8cd5d37e",
  });
  await expectBranchHasFile({
    branch,
    path: "nested/nested-file.txt",
    oid: "60eb5af9a0c03dc16dc6d0bd9a370c1aa4e095a3",
  });
  // Expect ignored files to not exist
  await expectBranchHasFile({ branch, path: ".env", oid: null });
  await expectBranchHasFile({
    branch,
    path: "coverage/foo/bar",
    oid: null,
  });
};

describe("git", () => {
  const branches: string[] = [];

  // Set timeout to 1 minute
  jest.setTimeout(60 * 1000);

  describe("commitChangesFromRepo", () => {
    const testDir = path.join(ROOT_TEMP_DIRECTORY, "commitChangesFromRepo");

    it("should correctly commit all changes", async () => {
      const branch = `${TEST_BRANCH_PREFIX}-multiple-changes`;
      branches.push(branch);

      await fs.promises.mkdir(testDir, { recursive: true });
      const repoDirectory = path.join(testDir, "repo-1");

      // Clone the git repo locally using the git cli and child-process
      await new Promise<void>((resolve, reject) => {
        const p = execFile(
          "git",
          ["clone", process.cwd(), "repo-1"],
          { cwd: testDir },
          (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          },
        );
        p.stdout?.pipe(process.stdout);
        p.stderr?.pipe(process.stderr);
      });

      await makeFileChanges(repoDirectory);

      // Push the changes
      await commitChangesFromRepo({
        octokit,
        ...REPO,
        branch,
        message: {
          headline: "Test commit",
          body: "This is a test commit",
        },
        repoDirectory,
        log,
      });

      await waitForGitHubToBeReady();

      await makeFileChangeAssertions(branch);

      // Expect the OID to be the HEAD commit
      const oid =
        (
          await git.log({
            fs,
            dir: repoDirectory,
            ref: "HEAD",
            depth: 1,
          })
        )[0]?.oid ?? "NO_OID";

      await expectParentHasOid({ branch, oid });
    });

    it("should correctly be able to base changes off specific commit", async () => {
      const branch = `${TEST_BRANCH_PREFIX}-specific-base`;
      branches.push(branch);

      await fs.promises.mkdir(testDir, { recursive: true });
      const repoDirectory = path.join(testDir, "repo-2");

      // Clone the git repo locally usig the git cli and child-process
      await new Promise<void>((resolve, reject) => {
        const p = execFile(
          "git",
          ["clone", process.cwd(), "repo-2"],
          { cwd: testDir },
          (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          },
        );
        p.stdout?.pipe(process.stdout);
        p.stderr?.pipe(process.stderr);
      });

      makeFileChanges(repoDirectory);

      // Determine the previous commit hash
      const gitLog = await git.log({
        fs,
        dir: repoDirectory,
        ref: "HEAD",
        depth: 2,
      });

      const oid = gitLog[1]?.oid ?? "";

      // Push the changes
      await commitChangesFromRepo({
        octokit,
        ...REPO,
        branch,
        message: {
          headline: "Test commit",
          body: "This is a test commit",
        },
        repoDirectory,
        log,
        base: {
          commit: oid,
        },
      });

      await waitForGitHubToBeReady();

      await makeFileChangeAssertions(branch);

      await expectParentHasOid({ branch, oid });
    });
  });

  afterAll(async () => {
    console.info("Cleaning up test branches");

    await deleteBranches(octokit, branches);
  });
});
