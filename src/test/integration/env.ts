import { pino } from "pino";
import { configDotenv } from "dotenv";

declare namespace global {
  const ROOT_TEST_BRANCH_PREFIX: string;
  const ROOT_TEMP_DIRECTORY: string;
}

export const ROOT_TEST_BRANCH_PREFIX = global.ROOT_TEST_BRANCH_PREFIX;
export const ROOT_TEMP_DIRECTORY = global.ROOT_TEMP_DIRECTORY;

configDotenv();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN must be set");
}

const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;

const [owner, repo] = GITHUB_REPOSITORY?.split("/") || [];
if (!owner || !repo) {
  throw new Error("GITHUB_REPOSITORY must be set");
}

export const ENV = {
  GITHUB_TOKEN,
};

export const REPO = { owner, repo };

export const log = pino({
  level: process.env.RUNNER_DEBUG === "1" ? "debug" : "info",
  transport: {
    target: "pino-pretty",
  },
});
