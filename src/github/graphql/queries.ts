export type GitHubClient = ReturnType<
  typeof import("@actions/github").getOctokit
>;

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
      ref {
        id
        target {
          ... on Commit {
            oid
          }
        }
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
  o: GitHubClient,
  v: GetRepositoryMetadataQueryVariables,
): Promise<GetRepositoryMetadataQuery["repository"]> => {
  const result = await o.graphql<GetRepositoryMetadataQuery>(
    GET_REPOSITORY_METADATA,
    v,
  );
  return result.repository;
};

export const createRefMutation = async (
  o: GitHubClient,
  v: CreateRefMutationVariables,
): Promise<CreateRefMutation> =>
  await o.graphql<CreateRefMutation>(CREATE_REF, v);

export const updateRefMutation = async (
  o: GitHubClient,
  v: UpdateRefMutationVariables,
): Promise<UpdateRefMutation> =>
  await o.graphql<UpdateRefMutation>(UPDATE_REF, v);

export const deleteRefMutation = async (
  o: GitHubClient,
  v: DeleteRefMutationVariables,
): Promise<DeleteRefMutation> =>
  await o.graphql<DeleteRefMutation>(DELETE_REF, v);

export const createCommitOnBranchQuery = async (
  o: GitHubClient,
  v: CreateCommitOnBranchMutationVariables,
): Promise<CreateCommitOnBranchMutation> =>
  o.graphql<CreateCommitOnBranchMutation>(CREATE_COMMIT_ON_BRANCH, v);

export const getRefTreeQuery = async (
  o: GitHubClient,
  v: GetRefTreeQueryVariables,
): Promise<GetRefTreeQuery> => o.graphql<GetRefTreeQuery>(GET_REF_TREE, v);
