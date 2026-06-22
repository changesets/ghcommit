export { commitChanges } from "./core.ts";

export function commitChangesSinceBase() {
  throw new Error(
    "commitChangesSinceBase is not supported in non-Node.js environments",
  );
}
