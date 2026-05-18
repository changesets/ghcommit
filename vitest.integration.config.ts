import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const ROOT_TEST_BRANCH_PREFIX =
  process.env.ROOT_TEST_BRANCH_PREFIX ??
  `test-${randomBytes(4).toString("hex")}`;

const ROOT_TEMP_DIRECTORY =
  process.env.ROOT_TEMP_DIRECTORY ??
  path.join(os.tmpdir(), ROOT_TEST_BRANCH_PREFIX);

export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/integration/globalSetup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    env: {
      ROOT_TEST_BRANCH_PREFIX,
      ROOT_TEMP_DIRECTORY,
    },
  },
});
