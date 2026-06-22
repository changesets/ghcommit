import type { getOctokit } from "@actions/github";

export type Octokit = ReturnType<typeof getOctokit>;

/**
 * Rough shape of the Octokit instance we need so we don't depend on the full
 * dependency and types.
 */
export interface PartialOctokit {
  request: unknown;
  graphql: unknown;
  rest: unknown;
  paginate: unknown;
}

import type {
  CreateCommitOnBranchMutation,
  CreateCommitOnBranchMutationVariables,
  CreateRefMutation,
  CreateRefMutationVariables,
  DeleteRefMutation,
  DeleteRefMutationVariables,
  GetRefTreeQuery,
  GetRefTreeQueryVariables,
  GetRepositoryMetadataQuery,
  GetRepositoryMetadataQueryVariables,
  UpdateRefMutation,
  UpdateRefMutationVariables,
} from "./generated/operations.js";

const GET_REPOSITORY_METADATA = /* GraphQL */ `
  query getRepositoryMetadata(
    $owner: String!
    $repo: String!
    $baseRef: String!
    $targetRef: String!
  ) {
    repository(owner: $owner, name: $repo) {
      id
      baseRef: ref(qualifiedName: $baseRef) {
        id
        target {
          oid
          ... on Tag {
            target {
              oid
            }
          }
        }
      }
      targetBranch: ref(qualifiedName: $targetRef) {
        id
        target {
          oid
        }
      }
    }
  }
`;

const CREATE_REF = /* GraphQL */ `
  mutation createRef($input: CreateRefInput!) {
    createRef(input: $input) {
      ref {
        id
      }
    }
  }
`;

const UPDATE_REF = /* GraphQL */ `
  mutation updateRef($input: UpdateRefInput!) {
    updateRef(input: $input) {
      ref {
        id
      }
    }
  }
`;

const DELETE_REF = /* GraphQL */ `
  mutation deleteRef($input: DeleteRefInput!) {
    deleteRef(input: $input) {
      clientMutationId
    }
  }
`;

const CREATE_COMMIT_ON_BRANCH = /* GraphQL */ `
  mutation createCommitOnBranch($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      commit {
        oid
      }
      ref {
        id
      }
    }
  }
`;

/** For tests only */
const GET_REF_TREE = /* GraphQL */ `
  query getRefTree(
    $owner: String!
    $repo: String!
    $ref: String!
    $path: String!
  ) {
    repository(owner: $owner, name: $repo) {
      ref(qualifiedName: $ref) {
        target {
          ... on Commit {
            tree {
              oid
            }
            parents(first: 10) {
              nodes {
                oid
              }
            }
            message
            file(path: $path) {
              oid
            }
          }
        }
      }
    }
  }
`;

export const getRepositoryMetadata = async (
  o: Octokit,
  v: GetRepositoryMetadataQueryVariables,
): Promise<GetRepositoryMetadataQuery["repository"]> => {
  const result = await o.graphql<GetRepositoryMetadataQuery>(
    GET_REPOSITORY_METADATA,
    v,
  );
  return result.repository;
};

export const createRefMutation = async (
  o: Octokit,
  v: CreateRefMutationVariables,
): Promise<CreateRefMutation> =>
  await o.graphql<CreateRefMutation>(CREATE_REF, v);

export const updateRefMutation = async (
  o: Octokit,
  v: UpdateRefMutationVariables,
): Promise<UpdateRefMutation> =>
  await o.graphql<UpdateRefMutation>(UPDATE_REF, v);

export const deleteRefMutation = async (
  o: Octokit,
  v: DeleteRefMutationVariables,
): Promise<DeleteRefMutation> =>
  await o.graphql<DeleteRefMutation>(DELETE_REF, v);

export const createCommitOnBranchQuery = async (
  o: Octokit,
  v: CreateCommitOnBranchMutationVariables,
): Promise<CreateCommitOnBranchMutation> =>
  o.graphql<CreateCommitOnBranchMutation>(CREATE_COMMIT_ON_BRANCH, v);

export const getRefTreeQuery = async (
  o: Octokit,
  v: GetRefTreeQueryVariables,
): Promise<GetRefTreeQuery> => o.graphql<GetRefTreeQuery>(GET_REF_TREE, v);
