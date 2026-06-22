export { commitChanges } from "./core.ts";
export { commitChangesSinceBase } from "./git.ts";

// NOTE: Only the node types will be picked up with our "exports" configuration,
// so only export the types in this file
export type {
  GitRef,
  CommitChangesOptions,
  CommitChangesSinceBaseOptions,
  CommitChangesResult,
} from "./types.ts";
export type {
  CommitMessage,
  FileChanges,
} from "./github/graphql/generated/types.ts";
export type { Octokit } from "./github/graphql/queries.ts";
