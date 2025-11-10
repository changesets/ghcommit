import {
  createRefMutation,
  getRepositoryMetadata,
  updateRefMutation,
} from "./github/graphql/queries.js";
import type { GetRepositoryMetadataQuery } from "./github/graphql/generated/operations.js";
import {
  CommitFilesFromBase64Args,
  CommitFilesResult,
  GitBase,
  FileModes,
} from "./interface.js";
import { CommitMessage } from "./github/graphql/generated/types.js";
import { isUtf8 } from "buffer";
import Queue from "queue";

// Types for GitHub Git Data API responses
interface GitCommitResponse {
  sha: string;
  tree: {
    sha: string;
  };
}

interface GitBlobResponse {
  sha: string;
}

interface GitTreeResponse {
  sha: string;
}

interface GitNewCommitResponse {
  sha: string;
}

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

  const commitMessageStr = finalMessage.body
    ? `${finalMessage.headline}\n\n${finalMessage.body}`
    : finalMessage.headline;

  await log?.debug(`Creating commit on branch ${branch} using Git Data API`);

  // Check if the octokit instance supports REST API calls
  if (!octokit.request) {
    throw new Error(
      "The provided octokit instance does not support REST API calls (missing request method). " +
        "Please provide an Octokit instance that supports both GraphQL and REST API, such as @octokit/core.",
    );
  }

  // Step 1: Get the base tree from the parent commit
  log?.debug(`Getting base commit ${baseOid}`);
  const baseCommit = await octokit.request<GitCommitResponse>(
    "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
    {
      owner,
      repo,
      commit_sha: baseOid,
    },
  );
  const baseTreeSha = baseCommit.data.tree.sha;
  log?.debug(`Base tree SHA: ${baseTreeSha}`);

  // Step 2: Create blobs for each file addition
  const treeItems: Array<
    {
      path: string;
      mode: string;
      type: "blob" | "tree" | "commit";
    } & (
      | {
          sha: string | null;
        }
      | {
          content: string;
        }
    )
  > = [];

  // Add file additions
  if (fileChanges.additions) {
    // Use a queue as we might have to upload a bunch of blobs concurrently
    const additionsProcessor = new Queue({
      concurrency: 5,
    });
    additionsProcessor.push(
      ...fileChanges.additions.map((addition) => {
        return async () => {
          if (isUtf8(Buffer.from(addition.contents, "base64"))) {
            log?.debug(`Using utf8 content directly for ${addition.path}`);

            treeItems.push({
              path: addition.path,
              mode: addition.mode || FileModes.file,
              type: "blob",
              content: Buffer.from(addition.contents, "base64").toString(
                "utf-8",
              ),
            });
          } else {
            log?.debug(`Creating blob for non-utf8 file at ${addition.path}`);
            const blobResponse = await octokit.request!<GitBlobResponse>(
              "POST /repos/{owner}/{repo}/git/blobs",
              {
                owner,
                repo,
                content: addition.contents,
                encoding: "base64",
              },
            );

            const mode = addition.mode || FileModes.file;
            log?.debug(
              `Created blob ${blobResponse.data.sha} for ${addition.path} with mode ${mode}`,
            );

            treeItems.push({
              path: addition.path,
              mode: mode,
              type: "blob",
              sha: blobResponse.data.sha,
            });
          }
        };
      }),
    );
    await new Promise<void>((resolve, reject) => additionsProcessor.start((err) => {
      if (err) {
        reject(err)
      } else {
        resolve();
      }
    }));
  }

  // Add file deletions (set sha to null)
  if (fileChanges.deletions) {
    for (const deletion of fileChanges.deletions) {
      log?.debug(`Marking ${deletion.path} for deletion`);
      treeItems.push({
        path: deletion.path,
        mode: "100644",
        type: "blob",
        sha: null,
      });
    }
  }

  // Step 3: Create new tree with the changes
  log?.debug(`Creating tree with ${treeItems.length} items`);
  const newTree = await octokit.request<GitTreeResponse>(
    "POST /repos/{owner}/{repo}/git/trees",
    {
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    },
  );
  log?.debug(`Created tree ${newTree.data.sha}`);

  // Step 4: Create the commit
  log?.debug(`Creating commit with message: ${finalMessage.headline}`);
  const newCommit = await octokit.request<GitNewCommitResponse>(
    "POST /repos/{owner}/{repo}/git/commits",
    {
      owner,
      repo,
      message: commitMessageStr,
      tree: newTree.data.sha,
      parents: [baseOid],
    },
  );
  log?.debug(`Created commit ${newCommit.data.sha}`);

  // Step 5: Update the branch ref to point to the new commit
  log?.debug(`Updating ref ${targetRef} to ${newCommit.data.sha}`);
  await octokit.request<void>("PATCH /repos/{owner}/{repo}/git/refs/{ref}", {
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.data.sha,
    force: false,
  });
  log?.debug(`Updated ref successfully`);

  return {
    refId: refId,
  };
};
