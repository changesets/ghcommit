import type { GetRepositoryMetadataQuery } from "./github/graphql/generated/operations.js";
import {
  createCommitOnBranchQuery,
  getRepositoryMetadata,
  type Octokit,
} from "./github/graphql/queries.ts";
import type { CommitChangesOptions, CommitChangesResult } from "./types.ts";
import { normalizeCommitMessage, resolveGitRef } from "./utils.ts";

type CreateCommit = (
  refId: string,
  branch: string,
) => Promise<{ commitSha: string }>;

/**
 * Commit file changes to a branch using the GitHub API.
 *
 * Works in Node.js and browsers.
 */
export async function commitChanges({
  octokit: partialOctokit,
  owner,
  repo,
  branch,
  base,
  force = false,
  message,
  fileChanges,
}: CommitChangesOptions): Promise<CommitChangesResult> {
  const octokit = partialOctokit as Octokit;
  const baseRef = resolveGitRef(base);

  const info = await getRepositoryMetadata(octokit, {
    owner,
    repo,
    baseRef,
    targetRef: `refs/heads/${branch}`,
  });
  if (!info) {
    throw new Error(`Repository "${owner}/${repo}" not found`);
  }

  // Commits will base off this sha as the parent. Also used to check if this
  // is the same as the target branch's HEAD so we can safely commit to it.
  const baseSha = "commit" in base ? base.commit : getBaseRefSha(info.baseRef);
  if (!baseSha) {
    throw new Error(`Could not determine sha for base ref "${baseRef}"`);
  }
  const targetSha = info.targetBranch?.target?.oid ?? null;

  const createCommit: CreateCommit = async (refId, branch) => {
    // Use GraphQL because REST would require each non-text file change to be a
    // separate `createBlob` call. While in most cases users would commit only
    // text files, it's hard to guarantee that and it's simpler to keep the API
    // as only accepting base64 content.
    const result = await createCommitOnBranchQuery(octokit, {
      input: {
        branch: { id: refId },
        expectedHeadOid: baseSha,
        message: normalizeCommitMessage(message),
        fileChanges,
      },
    });
    // `ref.id` is the same as `refId`. We only use `ref.id` to verify the commit succeeded
    if (result.createCommitOnBranch?.ref?.id == null) {
      throw new Error(`Failed to create commit on branch "${branch}"`);
    }
    if (result.createCommitOnBranch?.commit?.oid == null) {
      throw new Error(
        `Failed to determine commit sha for commit on branch "${branch}"`,
      );
    }
    return { commitSha: result.createCommitOnBranch.commit.oid };
  };

  // [CREATE] If the branch does not exist, create and commit to it
  if (targetSha == null) {
    const createdRef = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });
    const createdRefId = createdRef.data.node_id;
    if (!createdRefId) {
      throw new Error(`Failed to create branch "${branch}"`);
    }

    await createCommit(createdRefId, branch);

    return { refId: createdRefId };
  }
  // [UPDATE] If the branch exists and its HEAD matches the base, we can safely
  // directly commit to it
  else if (targetSha === baseSha) {
    // Safety: `targetSha` already ensures that `targetBranch` exists
    const targetRefId = info.targetBranch!.id;

    await createCommit(targetRefId, branch);

    return { refId: targetRefId };
  }
  // [FORCE UPDATE] If the branch exists but its HEAD does not match the base,
  // we can only update it if `force` is true, which works like a force push.
  //
  // FORCE UPDATE creates a temporary branch, commits to it and returns the
  // sha, and then force updates the existing branch with the new sha. We cannot
  // reset the branch and then commit because if the branch has an existing PR,
  // GitHub will auto-close as it sees there's no changes with the base.
  else if (force) {
    const tempBranch = `changesets-ghcommit-temp/${branch}`;

    try {
      const { tempRefId } = await createOrForceUpdateTemporaryBranch({
        octokit,
        owner,
        repo,
        tempBranch,
        baseSha,
      });

      const { commitSha } = await createCommit(tempRefId, tempBranch);

      const updatedRef = await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: commitSha,
        force: true,
      });
      const updatedRefId = updatedRef.data.node_id;
      if (!updatedRefId) {
        throw new Error(`Failed to force update branch "${branch}"`);
      }

      return { refId: updatedRefId };
    } finally {
      // Clean up the temporary branch
      await octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${tempBranch}`,
      });
    }
  }
  // [ERROR] If the branch exists but its HEAD does not match the base, and
  // `force` isn't true, we cannot commit to it. Throw an error.
  else {
    throw new Error(
      `Branch "${branch}" exists but its HEAD does not match the base ${baseSha} and \`force\` is set to false`,
    );
  }
}

function getBaseRefSha(
  baseRef: NonNullable<GetRepositoryMetadataQuery["repository"]>["baseRef"],
) {
  if (!baseRef?.target) return null;

  if ("target" in baseRef.target) {
    return baseRef.target.target.oid;
  }

  return baseRef.target.oid;
}

async function createOrForceUpdateTemporaryBranch({
  octokit,
  owner,
  repo,
  tempBranch,
  baseSha,
}: {
  octokit: Octokit;
  owner: string;
  repo: string;
  tempBranch: string;
  baseSha: string;
}) {
  try {
    const createdTempRef = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${tempBranch}`,
      sha: baseSha,
    });

    const createdTempRefId = createdTempRef.data.node_id;
    if (!createdTempRefId) {
      throw new Error(`Failed to create temporary branch "${tempBranch}"`);
    }

    return { tempRefId: createdTempRefId };
  } catch (error) {
    if (!isAlreadyExistingRefError(error)) {
      throw error;
    }

    const updatedTempRef = await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${tempBranch}`,
      sha: baseSha,
      force: true,
    });

    const updatedTempRefId = updatedTempRef.data.node_id;
    if (!updatedTempRefId) {
      throw new Error(
        `Failed to force update temporary branch "${tempBranch}"`,
      );
    }

    return { tempRefId: updatedTempRefId };
  }
}

function isAlreadyExistingRefError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof error.status === "number" &&
    typeof error.message === "string" &&
    error.status === 422 &&
    error.message.includes("Reference already exists")
  );
}
