import { defineConfig } from "tsdown/config";

const isCi = process.env.CI != null;

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/core.ts",
    "src/git.ts",
    "src/fs.ts",
    "src/node.ts",
  ],
  outDir: "dist",
  exports: false,
  // useful for running `build --watch` and `test` concurrently
  clean: !process.argv.includes("--watch"),
  deps: {
    onlyBundle: [], // require explicitly listing inlined dependencies
  },

  sourcemap: !isCi,
  dts: { enabled: true, parallel: !isCi, sourcemap: !isCi },
  format: ["cjs", "esm"],
  minify: "dce-only",
  platform: "node",

  checks: { pluginTimings: false },
  publint: true,
});
