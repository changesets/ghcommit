import { getRepositoryMetadata } from "./github/graphql/queries.js";
import type { GetRepositoryMetadataQuery } from "./github/graphql/generated/operations.js";
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

const createCommit = async ({
  octokit,
  owner,
  repo,
  baseOid,
  message,
  fileChanges,
}: Pick<
  CommitFilesFromBase64Args,
  "octokit" | "owner" | "repo" | "message" | "fileChanges"
> & {
  baseOid: string;
}) => {
  const normalizedMessage: CommitMessage =
    typeof message === "string"
      ? {
          headline: message.split("\n")[0]?.trim() ?? "",
          body: message.split("\n").slice(1).join("\n").trim(),
        }
      : message;

  const additions = await Promise.all(
    (fileChanges.additions ?? []).map(async ({ path, contents }) => {
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: contents,
        encoding: "base64",
      });

      return {
        path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha,
      };
    }),
  );

  const deletions = (fileChanges.deletions ?? []).map(({ path }) => ({
    path,
    mode: "100644" as const,
    type: "blob" as const,
    sha: null,
  }));

  const baseCommit = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: baseOid,
  });

  const tree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.data.tree.sha,
    tree: [...additions, ...deletions],
  });

  return octokit.rest.git.createCommit({
    owner,
    repo,
    message: normalizedMessage.body?.trim()
      ? `${normalizedMessage.headline}\n\n${normalizedMessage.body.trim()}`
      : normalizedMessage.headline,
    tree: tree.data.sha,
    parents: [baseOid],
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
    throw new Error(
      `Repository ${JSON.stringify(repositoryNameWithOwner)} not found`,
    );
  }
  if (!("commit" in base) && !info.baseRef) {
    throw new Error(`Ref ${JSON.stringify(baseRef)} not found`);
  }

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

  await log?.debug(`Creating commit on branch ${branch}`);
  const newCommit = await createCommit({
    octokit,
    owner,
    repo,
    baseOid,
    message,
    fileChanges,
  });

  if (mode !== "create") {
    const updatedRef = await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.data.sha,
      force: mode === "force-update",
    });

    return {
      refId: updatedRef.data.node_id ?? null,
    };
  }

  const createdRef = await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: newCommit.data.sha,
  });

  return {
    refId: createdRef.data.node_id ?? null,
  };
};
