import type { GetRepositoryMetadataQuery } from "./github/graphql/generated/operations.js";
import {
  createCommitOnBranchQuery,
  getRepositoryMetadata,
} from "./github/graphql/queries.ts";
import type {
  CommitFilesFromBase64Args,
  CommitFilesResult,
} from "./interface.ts";
import { normalizeCommitMessage, resolveGitRef } from "./utils.ts";

function getBaseRefSha(
  baseRef: NonNullable<GetRepositoryMetadataQuery["repository"]>["baseRef"],
) {
  if (!baseRef?.target) return null;

  if ("target" in baseRef.target) {
    return baseRef.target.target.oid;
  }

  return baseRef.target.oid;
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

async function createCommit({
  octokit,
  refId,
  baseSha,
  message,
  fileChanges,
}: Pick<CommitFilesFromBase64Args, "octokit" | "message" | "fileChanges"> & {
  refId: string;
  baseSha: string;
}) {
  // we have to stick to GraphQL here as with REST, each file change would become a separate API call
  return createCommitOnBranchQuery(octokit, {
    input: {
      branch: {
        id: refId,
      },
      expectedHeadOid: baseSha,
      message: normalizeCommitMessage(message),
      fileChanges,
    },
  });
}

export async function commitFilesFromBase64({
  octokit,
  owner,
  repo,
  branch,
  base,
  force = false,
  message,
  fileChanges,
}: CommitFilesFromBase64Args): Promise<CommitFilesResult> {
  const baseRef = resolveGitRef(base);
  const targetRef = `refs/heads/${branch}`;

  const info = await getRepositoryMetadata(octokit, {
    owner,
    repo,
    baseRef,
    targetRef,
  });

  if (!info) {
    throw new Error(`Repository "${owner}/${repo}" not found`);
  }

  /**
   * The commit sha to base the new commit on.
   *
   * Used both to create the new commit,
   * and to determine whether an existing branch can be updated.
   */
  const baseSha = "commit" in base ? base.commit : getBaseRefSha(info.baseRef);
  if (!baseSha) {
    throw new Error(`Could not determine sha for base ref "${baseRef}"`);
  }
  const targetSha = info.targetBranch?.target?.oid ?? null;
  const sameBranchBase = "branch" in base && base.branch === branch;

  let mode: "create" | "update" | "force-update";

  if (sameBranchBase) {
    mode = force ? "force-update" : "update";
  } else if (targetSha === null) {
    // TODO: legit *creation* failure should be retried if `force === true`
    mode = "create";
  } else if (force) {
    mode = "force-update";
  } else if (targetSha === baseSha) {
    mode = "update";
  } else {
    throw new Error(
      `Branch ${branch} exists already and does not match base ${baseSha}, force is set to false`,
    );
  }

  if (mode === "force-update") {
    // Use a stable temp branch name so a later run can recover and reuse it
    // if an earlier run failed before cleanup completed.
    const tempBranch = `changesets-ghcommit-temp/${branch}`;

    let tempRefId: string;

    try {
      const createdTempRef = await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${tempBranch}`,
        sha: baseSha,
      });

      const refIdStr = createdTempRef.data.node_id;

      if (!refIdStr) {
        throw new Error(`Failed to create temporary branch ${tempBranch}`);
      }

      tempRefId = refIdStr;
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

      const refIdStr = updatedTempRef.data.node_id;

      if (!refIdStr) {
        throw new Error(`Failed to update temporary branch ${tempBranch}`);
      }

      tempRefId = refIdStr;
    }

    const tempCommit = await createCommit({
      octokit,
      refId: tempRefId,
      baseSha,
      message,
      fileChanges,
    });

    const tempHeadSha = tempCommit.createCommitOnBranch?.commit?.oid;

    if (!tempHeadSha) {
      throw new Error(
        `Failed to determine head commit of temporary branch ${tempBranch}`,
      );
    }

    const updatedTargetRef = await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: tempHeadSha,
      force: true,
    });

    const updatedTargetRefId = updatedTargetRef.data.node_id;

    if (!updatedTargetRefId) {
      throw new Error(`Failed to update branch ${branch}`);
    }

    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${tempBranch}`,
    });

    return {
      refId: updatedTargetRefId,
    };
  }

  let refId: string;

  if (mode === "create") {
    const createdRef = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha: baseSha,
    });

    const refIdStr = createdRef.data.node_id;

    if (!refIdStr) {
      throw new Error(`Failed to create branch ${branch}`);
    }

    refId = refIdStr;
  } else {
    refId = sameBranchBase ? info.baseRef!.id : info.targetBranch!.id;
  }

  const newCommit = await createCommit({
    octokit,
    refId,
    baseSha,
    message,
    fileChanges,
  });

  return {
    refId: newCommit.createCommitOnBranch?.ref?.id ?? null,
  };
}
