import type { CommitMessage } from "./github/graphql/generated/types.ts";
import type { GitRef } from "./interface.ts";

export function normalizeCommitMessage(
  message: string | CommitMessage,
): CommitMessage {
  if (typeof message === "object") {
    return {
      headline: message.headline.trim(),
      body: message.body?.trim(),
    };
  }

  if (!message.includes("\n")) {
    return { headline: message.trim() };
  }

  const [headline, ...bodyLines] = message.split("\n");
  return {
    headline: headline.trim(),
    body: bodyLines.join("\n").trim(),
  };
}

export function resolveGitRef(ref: GitRef): string {
  if ("branch" in ref) {
    return `refs/heads/${ref.branch}`;
  } else if ("tag" in ref) {
    return `refs/tags/${ref.tag}`;
  } else {
    return ref.commit;
  }
}
