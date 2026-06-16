import type { GetRepositoryMetadataQuery } from "./github/graphql/generated/operations.js";
import {
  createCommitOnBranchQuery,
  getRepositoryMetadata,
} from "./github/graphql/queries.ts";
import type {
  CommitFilesFromBase64Args,
  CommitFilesResult,
  GitBase,
} from "./interface.ts";
import { normalizeCommitMessage } from "./utils.ts";

const getBaseRef = (base: GitBase): string => {
  if ("branch" in base) {
    return `refs/heads/${base.branch}`;
  } else if ("tag" in base) {
    return `refs/tags/${base.tag}`;
  } else {
    // For explicit commit bases we don't resolve the base oid from a ref,
    // but the shared metadata query still expects a valid qualified ref name.
    return "HEAD";
  }
};

const getOidFromRef = (
  base: GitBase,
  ref: (GetRepositoryMetadataQuery["repository"] &
    Record<never, never>)["baseRef"],
) => {
  if ("commit" in base) {
    return base.commit;
  }

  if (!ref?.target) {
    throw new Error(`Could not determine oid from ref: ${JSON.stringify(ref)}`);
  }

  if ("target" in ref.target) {
    return ref.target.target.oid;
  }

  return ref.target.oid;
};

const isAlreadyExistingRefError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  "message" in error &&
  typeof error.status === "number" &&
  typeof error.message === "string" &&
  error.status === 422 &&
  error.message.includes("Reference already exists");

const createCommit = async ({
  octokit,
  refId,
  baseOid,
  message,
  fileChanges,
}: Pick<CommitFilesFromBase64Args, "octokit" | "message" | "fileChanges"> & {
  refId: string;
  baseOid: string;
}) => {
  // we have to stick to GraphQL here as with REST, each file change would become a separate API call
  return createCommitOnBranchQuery(octokit, {
    input: {
      branch: {
        id: refId,
      },
      expectedHeadOid: baseOid,
      message: normalizeCommitMessage(message),
      fileChanges,
    },
  });
};

export const commitFilesFromBase64 = async ({
  octokit,
  owner,
  repo,
  branch,
  base,
  force = false,
  message,
  fileChanges,
}: CommitFilesFromBase64Args): Promise<CommitFilesResult> => {
  const repositoryNameWithOwner = `${owner}/${repo}`;
  const baseRef = getBaseRef(base);
  const targetRef = `refs/heads/${branch}`;

  const info = await getRepositoryMetadata(octokit, {
    owner,
    repo,
    baseRef,
    targetRef,
  });

  if (!info) {
    throw new Error(
      `Repository ${JSON.stringify(repositoryNameWithOwner)} not found`,
    );
  }
  if (!("commit" in base) && !info.baseRef) {
    throw new Error(`Ref ${JSON.stringify(baseRef)} not found`);
  }

  const resolvedBaseRef = info.baseRef;

  /**
   * The commit oid to base the new commit on.
   *
   * Used both to create the new commit,
   * and to determine whether an existing branch can be updated.
   */
  const baseOid = getOidFromRef(base, info.baseRef);
  const targetOid = info.targetBranch?.target?.oid ?? null;
  const sameBranchBase = "branch" in base && base.branch === branch;

  let mode: "create" | "update" | "force-update";

  if (sameBranchBase) {
    mode = force ? "force-update" : "update";
  } else if (targetOid === null) {
    // TODO: legit *creation* failure should be retried if `force === true`
    mode = "create";
  } else if (force) {
    mode = "force-update";
  } else if (targetOid === baseOid) {
    mode = "update";
  } else {
    throw new Error(
      `Branch ${branch} exists already and does not match base ${baseOid}, force is set to false`,
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
        sha: baseOid,
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
        sha: baseOid,
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
      baseOid,
      message,
      fileChanges,
    });

    const tempHeadOid = tempCommit.createCommitOnBranch?.commit?.oid;

    if (!tempHeadOid) {
      throw new Error(
        `Failed to determine head commit of temporary branch ${tempBranch}`,
      );
    }

    const updatedTargetRef = await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: tempHeadOid,
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
      sha: baseOid,
    });

    const refIdStr = createdRef.data.node_id;

    if (!refIdStr) {
      throw new Error(`Failed to create branch ${branch}`);
    }

    refId = refIdStr;
  } else {
    refId = sameBranchBase ? resolvedBaseRef!.id : info.targetBranch!.id;
  }

  const newCommit = await createCommit({
    octokit,
    refId,
    baseOid,
    message,
    fileChanges,
  });

  return {
    refId: newCommit.createCommitOnBranch?.ref?.id ?? null,
  };
};
