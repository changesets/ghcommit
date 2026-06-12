import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";

try {
  loadEnvFile();
} catch {}

if (!process.env.GITHUB_TOKEN) {
  throw new Error("GITHUB_TOKEN must be set");
}
if (!process.env.GITHUB_REPOSITORY) {
  throw new Error("GITHUB_REPOSITORY must be set");
}

export default defineConfig({
  test: {
    experimental: { preParse: true },
    clearMocks: true,
    testTimeout: 60_000,
    include: ["tests/integration/*.test.ts"],
  },
});
