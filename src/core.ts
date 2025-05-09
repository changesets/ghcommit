import {
  createCommitOnBranchQuery,
  createRefMutation,
  getRepositoryMetadata,
  updateRefMutation,
} from "./github/graphql/queries.js";
import type {
  CreateCommitOnBranchMutationVariables,
  GetRepositoryMetadataQuery,
} from "./github/graphql/generated/operations.js";
import {
  CommitFilesFromBase64Args,
  CommitFilesResult,
  GitBase,
} from "./interface.js";
import { CommitMessage } from "./github/graphql/generated/types.js";

const getBaseRef = (base: GitBase): string => {
  if ("branch" in base) {
    return `refs/heads/${base.branch}`;
  } else if ("tag" in base) {
    return `refs/tags/${base.tag}`;
  } else {
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

export const commitFilesFromBase64 = async ({
  octokit,
  owner,
  repo,
  branch,
  base,
  force = false,
  message,
  fileChanges,
  log,
}: CommitFilesFromBase64Args): Promise<CommitFilesResult> => {
  const repositoryNameWithOwner = `${owner}/${repo}`;
  const baseRef = getBaseRef(base);
  const targetRef = `refs/heads/${branch}`;

  log?.debug(`Getting repo info ${repositoryNameWithOwner}`);
  const info = await getRepositoryMetadata(octokit, {
    owner,
    repo,
    baseRef,
    targetRef,
  });
  log?.debug(`Repo info: ${JSON.stringify(info, null, 2)}`);

  if (!info) {
    throw new Error(`Repository ${repositoryNameWithOwner} not found`);
  }

  const repositoryId = info.id;
  /**
   * The commit oid to base the new commit on.
   *
   * Used both to create / update the new branch (if necessary),
   * and to ensure no changes have been made as we push the new commit.
   */
  const baseOid = getOidFromRef(base, info.baseRef);

  let refId: string;

  if ("branch" in base && base.branch === branch) {
    log?.debug(`Committing to the same branch as base: ${branch} (${baseOid})`);
    // Get existing branch refId

    if (!info.baseRef) {
      throw new Error(`Ref ${baseRef} not found`);
    }
    refId = info.baseRef.id;
  } else {
    // Determine if the branch needs to be created or not
    if (info.targetBranch?.target?.oid) {
      // Branch already exists, check if it matches the base
      if (info.targetBranch.target.oid !== baseOid) {
        if (force) {
          log?.debug(
            `Branch ${branch} exists but does not match base ${baseOid}, forcing update to base`,
          );
          const refIdUpdate = await updateRefMutation(octokit, {
            input: {
              refId: info.targetBranch.id,
              oid: baseOid,
              force: true,
            },
          });

          log?.debug(
            `Updated branch with refId ${JSON.stringify(refIdUpdate, null, 2)}`,
          );

          const refIdStr = refIdUpdate.updateRef?.ref?.id;

          if (!refIdStr) {
            throw new Error(`Failed to create branch ${branch}`);
          }

          refId = refIdStr;
        } else {
          throw new Error(
            `Branch ${branch} exists already and does not match base ${baseOid}, force is set to false`,
          );
        }
      } else {
        log?.debug(
          `Branch ${branch} already exists and matches base ${baseOid}`,
        );
        refId = info.targetBranch.id;
      }
    } else {
      // Create branch as it does not exist yet
      log?.debug(`Creating branch ${branch} from commit ${baseOid}}`);
      const refIdCreation = await createRefMutation(octokit, {
        input: {
          repositoryId,
          name: `refs/heads/${branch}`,
          oid: baseOid,
        },
      });

      log?.debug(
        `Created branch with refId ${JSON.stringify(refIdCreation, null, 2)}`,
      );

      const refIdStr = refIdCreation.createRef?.ref?.id;

      if (!refIdStr) {
        throw new Error(`Failed to create branch ${branch}`);
      }

      refId = refIdStr;
    }
  }

  const finalMessage: CommitMessage =
    typeof message === "string"
      ? {
          headline: message.split("\n")[0]?.trim() ?? "",
          body: message.split("\n").slice(1).join("\n").trim(),
        }
      : message;

  await log?.debug(`Creating commit on branch ${branch}`);
  const createCommitMutation: CreateCommitOnBranchMutationVariables = {
    input: {
      branch: {
        id: refId,
      },
      expectedHeadOid: baseOid,
      message: finalMessage,
      fileChanges,
    },
  };
  log?.debug(JSON.stringify(createCommitMutation, null, 2));

  const result = await createCommitOnBranchQuery(octokit, createCommitMutation);
  return {
    refId: result.createCommitOnBranch?.ref?.id ?? null,
  };
};
