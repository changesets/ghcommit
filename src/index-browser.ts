export { commitFilesFromBase64 } from "./core.ts";

export function commitChangesFromRepo() {
  throw new Error(
    "commitChangesFromRepo is not supported in non-Node.js environments"
  );
}
