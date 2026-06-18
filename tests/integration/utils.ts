import crypto from "node:crypto";
import { getOctokit } from "@actions/github";
import { expect } from "vitest";
import {
  deleteRefMutation,
  getRefTreeQuery,
  getRepositoryMetadata,
} from "../../src/github/graphql/queries.ts";

export const githubToken = process.env.GITHUB_TOKEN!;
export const [owner, repo] = process.env.GITHUB_REPOSITORY!.split("/")!;

export const octokit = getOctokit(githubToken);

/**
 * GitHub sometimes has a delay between making changes to a git repo,
 * and those changes being reflected in the API.
 *
 * This function is a workaround to wait for GitHub to be ready
 * before running these assertions.
 *
 * It slows down testing a bit,
 * but it's better than having flaky tests.
 */
export async function waitForGitHubToBeReady() {
  return await new Promise((r) => setTimeout(r, 5000));
}

const runHash = crypto.randomBytes(4).toString("hex");
const runId = process.env.GITHUB_RUN_ID ?? "local";
export function getTempBranch(name: string) {
  return `changesets-ghcommit-test-${runHash}-id-${runId}/${name}`;
}

/**
 * Calculate the SHA using git blob hash format
 */
export function getSha(contents: Buffer): string {
  const header = Buffer.from(`blob ${contents.length}\0`);
  return crypto
    .createHash("sha1")
    .update(header)
    .update(contents)
    .digest("hex");
}

// #region Assertion helpers

export async function expectBranchHasTree({
  branch,
  treeSha,
}: {
  branch: string;
  treeSha: string;
}) {
  const ref = (
    await getRefTreeQuery(octokit, {
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      path: "package.json",
    })
  ).repository?.ref?.target;

  if (!ref) {
    throw new Error("Unexpected missing ref");
  }

  expect(ref.tree.oid).toEqual(treeSha);
}

export async function expectBranchHasFile({
  branch,
  filePath,
  fileSha,
}: {
  branch: string;
  filePath: string;
  fileSha: string;
}) {
  const ref = (
    await getRefTreeQuery(octokit, {
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      path: filePath,
    })
  ).repository?.ref?.target;

  if (!ref) {
    throw new Error("Unexpected missing ref");
  }

  expect(ref.file?.oid).toEqual(fileSha);
}

export async function expectBranchNotHaveFile({
  branch,
  filePath,
}: {
  branch: string;
  filePath: string;
}) {
  await expect(() =>
    getRefTreeQuery(octokit, {
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      path: filePath,
    }),
  ).rejects.toThrow("Could not resolve file for path");
}

export async function expectParentHasSha({
  branch,
  sha,
}: {
  branch: string;
  sha: string;
}) {
  const ref = (
    await getRefTreeQuery(octokit, {
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      path: "package.json",
    })
  ).repository?.ref?.target;

  if (!ref || !("parents" in ref)) {
    throw new Error("Unexpected result");
  }

  expect(ref.parents.nodes?.[0]?.oid).toEqual(sha);
}

export async function expectBranchDoesNotExist(branch: string) {
  await expect(
    octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    }),
  ).rejects.toMatchObject({
    status: 404,
  });
}

// #endregion

// #region Octokit helpers

export async function deleteBranch(branch: string, allowNotExist = false) {
  try {
    const ref = await getRepositoryMetadata(octokit, {
      owner,
      repo,
      baseRef: `refs/heads/${branch}`,
      targetRef: `refs/heads/${branch}`,
    });

    const refId = ref?.baseRef?.id;
    if (!refId) {
      if (!allowNotExist) {
        console.warn(`Branch ${branch} not found`);
      }
      return;
    }

    await deleteRefMutation(octokit, {
      input: {
        refId,
      },
    });
  } catch (error) {
    console.error(`Failed to delete branch ${branch}:`, error);
  }
}

// #endregion
