import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";

try {
  loadEnvFile();
} catch {}

process.env.ROOT_TEST_BRANCH_PREFIX ??= `test-${randomBytes(4).toString("hex")}`;
process.env.ROOT_TEMP_DIRECTORY ??= path.join(
  os.tmpdir(),
  process.env.ROOT_TEST_BRANCH_PREFIX,
);

export default defineConfig({
  test: {
    globalSetup: ["./tests/integration/globalSetup.ts"],
    include: ["tests/integration/**/*.test.ts"],
  },
});
