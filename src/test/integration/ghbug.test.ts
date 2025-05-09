import { getOctokit } from "@actions/github";
import { promises as fs } from "fs";

import { ENV, REPO, ROOT_TEST_BRANCH_PREFIX } from "./env.js";
import { deleteBranches } from "./util.js";
import {
  createRefMutation,
  getRepositoryMetadata,
} from "../../github/graphql/queries.js";
import git from "isomorphic-git";

const octokit = getOctokit(ENV.GITHUB_TOKEN);

const TEST_BRANCH_PREFIX = `${ROOT_TEST_BRANCH_PREFIX}-ghbug`;

describe("demonstrate bug with", () => {
  const branches: string[] = [];

  // Set timeout to 1 minute
  jest.setTimeout(60 * 1000);

  let repositoryId: string;
  let shas: string[] = [];

  beforeAll(async () => {
    const response = await getRepositoryMetadata(octokit, {
      owner: REPO.owner,
      name: REPO.repository,
      baseRef: "HEAD",
      targetRef: "HEAD",
    });
    if (!response?.id) {
      throw new Error("Repository not found");
    }
    repositoryId = response.id;
    // Get most recent 10 commits
    const log = await git.log({ fs, dir: process.cwd(), depth: 10 });
    shas = log.map((commit) => commit.oid);
    console.log("SHAS", shas);
  });

  for (let i = 0; i < 10; i++) {
    describe(`Create branches from HEAD~${i}`, () => {
      it(`GraphQL: createRef mutation`, async () => {
        const branch = `${TEST_BRANCH_PREFIX}-graphql-${i}`;
        branches.push(branch);
        // Create test directory

        await createRefMutation(octokit, {
          input: {
            repositoryId,
            name: `refs/heads/${branch}`,
            oid: shas[i],
          },
        });
      });

      it(`REST: createRef mutation`, async () => {
        const branch = `${TEST_BRANCH_PREFIX}-rest-${i}`;
        branches.push(branch);
        // Create test directory
        await octokit.rest.git.createRef({
          owner: REPO.owner,
          repo: REPO.repository,
          ref: `refs/heads/${branch}`,
          sha: shas[i] ?? "",
        });
      });
    });
  }

  afterAll(async () => {
    console.info("Cleaning up test branches");

    await deleteBranches(octokit, branches);
  });
});
