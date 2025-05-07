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
import { mockCwd } from "mock-cwd";

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

const makeFileChanges = async (
  repoDirectory: string,
  changegroup:
    | "standard"
    | "with-executable-file"
    | "with-ignored-symlink"
    | "with-included-valid-symlink"
    | "with-included-invalid-symlink",
) => {
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
  if (changegroup === "with-executable-file") {
    // Add an executable file
    await fs.promises.writeFile(
      path.join(repoDirectory, "executable-file.sh"),
      "#!/bin/bash\necho hello",
    );
    await fs.promises.chmod(
      path.join(repoDirectory, "executable-file.sh"),
      0o755,
    );
  }
  if (changegroup === "with-ignored-symlink") {
    // node_modules is ignored in this repo
    await fs.promises.mkdir(path.join(repoDirectory, "node_modules"), {
      recursive: true,
    });
    await fs.promises.symlink(
      path.join(repoDirectory, "non-existent"),
      path.join(repoDirectory, "node_modules", "nested"),
    );
  }
  if (changegroup === "with-included-valid-symlink") {
    await fs.promises.mkdir(path.join(repoDirectory, "some-dir"), {
      recursive: true,
    });
    await fs.promises.symlink(
      path.join(repoDirectory, "README.md"),
      path.join(repoDirectory, "some-dir", "nested"),
    );
  }
  if (changegroup === "with-included-invalid-symlink") {
    await fs.promises.mkdir(path.join(repoDirectory, "some-dir"), {
      recursive: true,
    });
    await fs.promises.symlink(
      path.join(repoDirectory, "non-existent"),
      path.join(repoDirectory, "some-dir", "nested"),
    );
  }
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

const makeSubdirectoryFileChangeAssertions = async (branch: string) => {
  // Expect new file outside of subdir to not exist
  await expectBranchHasFile({
    branch,
    path: "new-file.txt",
    oid: null,
  });
  // Expect new files to have correct oid
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

const makeFilteredFileChangeAssertions = async (branch: string) => {
  // Expect the deleted files to not exist
  await expectBranchHasFile({ branch, path: "package.json", oid: null });
  // Expect new files to have correct oid
  await expectBranchHasFile({
    branch,
    path: "new-file.txt",
    oid: "be5b944ff55ca7569cc2ae34c35b5bda8cd5d37e",
  });
  // Expect filtered-out file to not exist
  await expectBranchHasFile({
    branch,
    path: "nested/nested-file.txt",
    oid: null,
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

    for (const group of ["standard", "with-ignored-symlink"] as const) {
      it(`should correctly commit all changes for group: ${group}`, async () => {
        const branch = `${TEST_BRANCH_PREFIX}-multiple-changes-${group}`;
        branches.push(branch);

        await fs.promises.mkdir(testDir, { recursive: true });
        const repoDirectory = path.join(testDir, `repo-1-${group}`);

        // Clone the git repo locally using the git cli and child-process
        await new Promise<void>((resolve, reject) => {
          const p = execFile(
            "git",
            ["clone", process.cwd(), `repo-1-${group}`],
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

        await makeFileChanges(repoDirectory, group);

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
    }

    describe(`should throw appropriate error when symlink is present`, () => {
      it(`and file does not exist`, async () => {
        const branch = `${TEST_BRANCH_PREFIX}-invalid-symlink-error`;
        branches.push(branch);

        await fs.promises.mkdir(testDir, { recursive: true });
        const repoDirectory = path.join(testDir, `repo-invalid-symlink`);

        // Clone the git repo locally using the git cli and child-process
        await new Promise<void>((resolve, reject) => {
          const p = execFile(
            "git",
            ["clone", process.cwd(), `repo-invalid-symlink`],
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

        await makeFileChanges(repoDirectory, "with-included-invalid-symlink");

        // Push the changes
        await expect(() =>
          commitChangesFromRepo({
            octokit,
            ...REPO,
            branch,
            message: {
              headline: "Test commit",
              body: "This is a test commit",
            },
            repoDirectory,
            log,
          }),
        ).rejects.toThrow(
          "Unexpected symlink at some-dir/nested, GitHub API only supports files and directories. You may need to add this file to .gitignore",
        );
      });

      it(`and file exists`, async () => {
        const branch = `${TEST_BRANCH_PREFIX}-valid-symlink-error`;
        branches.push(branch);

        await fs.promises.mkdir(testDir, { recursive: true });
        const repoDirectory = path.join(testDir, `repo-valid-symlink`);

        // Clone the git repo locally using the git cli and child-process
        await new Promise<void>((resolve, reject) => {
          const p = execFile(
            "git",
            ["clone", process.cwd(), `repo-valid-symlink`],
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

        await makeFileChanges(repoDirectory, "with-included-valid-symlink");

        // Push the changes
        await expect(() =>
          commitChangesFromRepo({
            octokit,
            ...REPO,
            branch,
            message: {
              headline: "Test commit",
              body: "This is a test commit",
            },
            repoDirectory,
            log,
          }),
        ).rejects.toThrow(
          "Unexpected symlink at some-dir/nested, GitHub API only supports files and directories. You may need to add this file to .gitignore",
        );
      });
    });

    it(`should throw appropriate error when executable file is present`, async () => {
      const branch = `${TEST_BRANCH_PREFIX}-executable-file`;
      branches.push(branch);

      await fs.promises.mkdir(testDir, { recursive: true });
      const repoDirectory = path.join(testDir, `repo-executable-file`);

      // Clone the git repo locally using the git cli and child-process
      await new Promise<void>((resolve, reject) => {
        const p = execFile(
          "git",
          ["clone", process.cwd(), `repo-executable-file`],
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

      await makeFileChanges(repoDirectory, "with-executable-file");

      // Push the changes
      await expect(() =>
        commitChangesFromRepo({
          octokit,
          ...REPO,
          branch,
          message: {
            headline: "Test commit",
            body: "This is a test commit",
          },
          repoDirectory,
          log,
        }),
      ).rejects.toThrow(
        "Unexpected executable file at executable-file.sh, GitHub API only supports non-executable files and directories. You may need to add this file to .gitignore",
      );
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

      makeFileChanges(repoDirectory, "standard");

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

    describe("when running directly in repository directory", () => {
      describe("repoDirectory: unspecified", () => {
        it(`should correctly commit all changes`, async () => {
          const branch = `${TEST_BRANCH_PREFIX}-root-repodirectory-unspecified`;
          branches.push(branch);

          await fs.promises.mkdir(testDir, { recursive: true });
          const repoDirectory = path.join(
            testDir,
            `repo-root-repodirectory-unspecified`,
          );

          // Clone the git repo locally using the git cli and child-process
          await new Promise<void>((resolve, reject) => {
            const p = execFile(
              "git",
              ["clone", process.cwd(), `repo-root-repodirectory-unspecified`],
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

          await makeFileChanges(repoDirectory, "standard");

          // Push the changes
          await mockCwd(repoDirectory, () =>
            commitChangesFromRepo({
              octokit,
              ...REPO,
              branch,
              message: {
                headline: "Test commit",
                body: "This is a test commit",
              },
              log,
            }),
          );

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

        it(`addFromDirectory should correctly filter files`, async () => {
          const branch = `${TEST_BRANCH_PREFIX}-root-repodirectory-unspecified-add`;
          branches.push(branch);

          await fs.promises.mkdir(testDir, { recursive: true });
          const repoDirectory = path.join(
            testDir,
            `repo-root-repodirectory-unspecified-add`,
          );

          // Clone the git repo locally using the git cli and child-process
          await new Promise<void>((resolve, reject) => {
            const p = execFile(
              "git",
              [
                "clone",
                process.cwd(),
                `repo-root-repodirectory-unspecified-add`,
              ],
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

          await makeFileChanges(repoDirectory, "standard");

          // Push the changes
          await mockCwd(repoDirectory, () =>
            commitChangesFromRepo({
              octokit,
              ...REPO,
              branch,
              message: {
                headline: "Test commit",
                body: "This is a test commit",
              },
              addFromDirectory: path.join(repoDirectory, "nested"),
              log,
            }),
          );

          await waitForGitHubToBeReady();

          await makeSubdirectoryFileChangeAssertions(branch);

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

        it(`filterFiles should correctly filter files`, async () => {
          const branch = `${TEST_BRANCH_PREFIX}-root-repodirectory-unspecified-filter`;
          branches.push(branch);

          await fs.promises.mkdir(testDir, { recursive: true });
          const repoDirectory = path.join(
            testDir,
            `repo-root-repodirectory-unspecified-filter`,
          );

          // Clone the git repo locally using the git cli and child-process
          await new Promise<void>((resolve, reject) => {
            const p = execFile(
              "git",
              [
                "clone",
                process.cwd(),
                `repo-root-repodirectory-unspecified-filter`,
              ],
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

          await makeFileChanges(repoDirectory, "standard");

          // Push the changes
          await mockCwd(repoDirectory, () =>
            commitChangesFromRepo({
              octokit,
              ...REPO,
              branch,
              message: {
                headline: "Test commit",
                body: "This is a test commit",
              },
              // Only include top-level files
              filterFiles: (file) => !file.includes("/"),
              log,
            }),
          );

          await waitForGitHubToBeReady();

          await makeFilteredFileChangeAssertions(branch);

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
      });
    });

    describe("when running in repository sub-directory", () => {
      describe("repoDirectory: unspecified", () => {
        it(`should correctly commit all changes`, async () => {
          const branch = `${TEST_BRANCH_PREFIX}-subdir-repodirectory-unspecified`;
          branches.push(branch);

          await fs.promises.mkdir(testDir, { recursive: true });
          const repoDirectory = path.join(
            testDir,
            `repo-subdir-repodirectory-unspecified`,
          );

          // Clone the git repo locally using the git cli and child-process
          await new Promise<void>((resolve, reject) => {
            const p = execFile(
              "git",
              ["clone", process.cwd(), `repo-subdir-repodirectory-unspecified`],
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

          await makeFileChanges(repoDirectory, "standard");

          // Push the changes
          await mockCwd(path.join(repoDirectory, "nested"), () =>
            commitChangesFromRepo({
              octokit,
              ...REPO,
              branch,
              message: {
                headline: "Test commit",
                body: "This is a test commit",
              },
              log,
            }),
          );

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

        it(`addFromDirectory should correctly filter files`, async () => {
          const branch = `${TEST_BRANCH_PREFIX}-subdir-repodirectory-unspecified-add`;
          branches.push(branch);

          await fs.promises.mkdir(testDir, { recursive: true });
          const repoDirectory = path.join(
            testDir,
            `repo-subdir-repodirectory-unspecified-add`,
          );

          // Clone the git repo locally using the git cli and child-process
          await new Promise<void>((resolve, reject) => {
            const p = execFile(
              "git",
              [
                "clone",
                process.cwd(),
                `repo-subdir-repodirectory-unspecified-add`,
              ],
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

          await makeFileChanges(repoDirectory, "standard");

          // Push the changes
          await mockCwd(path.join(repoDirectory, "nested"), () =>
            commitChangesFromRepo({
              octokit,
              ...REPO,
              branch,
              message: {
                headline: "Test commit",
                body: "This is a test commit",
              },
              addFromDirectory: path.join(repoDirectory, "nested"),
              log,
            }),
          );

          await waitForGitHubToBeReady();

          await makeSubdirectoryFileChangeAssertions(branch);

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

        it(`filterFiles should correctly filter files`, async () => {
          const branch = `${TEST_BRANCH_PREFIX}-subdir-repodirectory-unspecified-filter`;
          branches.push(branch);

          await fs.promises.mkdir(testDir, { recursive: true });
          const repoDirectory = path.join(
            testDir,
            `repo-subdir-repodirectory-unspecified-filter`,
          );

          // Clone the git repo locally using the git cli and child-process
          await new Promise<void>((resolve, reject) => {
            const p = execFile(
              "git",
              [
                "clone",
                process.cwd(),
                `repo-subdir-repodirectory-unspecified-filter`,
              ],
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

          await makeFileChanges(repoDirectory, "standard");

          // Push the changes
          await mockCwd(path.join(repoDirectory, "nested"), () =>
            commitChangesFromRepo({
              octokit,
              ...REPO,
              branch,
              message: {
                headline: "Test commit",
                body: "This is a test commit",
              },
              // Only include top-level files
              filterFiles: (file) => !file.includes("/"),
              log,
            }),
          );

          await waitForGitHubToBeReady();

          await makeFilteredFileChangeAssertions(branch);

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
      });
    });
  });

  afterAll(async () => {
    console.info("Cleaning up test branches");

    await deleteBranches(octokit, branches);
  });
});
