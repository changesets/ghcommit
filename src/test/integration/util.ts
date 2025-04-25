import {
  deleteRefMutation,
  getRepositoryMetadata,
  GitHubClient,
} from "../../github/graphql/queries.js";
import { REPO } from "./env.js";

export const deleteBranches = async (
  octokit: GitHubClient,
  branches: string[],
) =>
  Promise.all(
    branches.map(async (branch) => {
      console.debug(`Deleting branch ${branch}`);
      // Get Ref
      const ref = await getRepositoryMetadata(octokit, {
        ...REPO,
        baseRef: `refs/heads/${branch}`,
        targetRef: `refs/heads/${branch}`,
      });

      const refId = ref?.baseRef?.id;

      if (!refId) {
        console.warn(`Branch ${branch} not found`);
        return;
      }

      await deleteRefMutation(octokit, {
        input: {
          refId,
        },
      });

      console.debug(`Deleted branch ${branch}`);
    }),
  );

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
export const waitForGitHubToBeReady = () =>
  new Promise((r) => setTimeout(r, 5000));
