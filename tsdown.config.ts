import { defineConfig } from "tsdown/config";

const isCi = process.env.CI != null;

export default defineConfig({
  entry: ["src/index-browser.ts", "src/index-node.ts"],
  outDir: "dist",
  hash: false,
  exports: false,
  // useful for running `build --watch` and `test` concurrently
  clean: !process.argv.includes("--watch"),
  deps: {
    onlyBundle: [], // require explicitly listing inlined dependencies
  },

  sourcemap: !isCi,
  dts: { enabled: true, parallel: !isCi, sourcemap: !isCi },
  format: "esm",
  minify: "dce-only",
  platform: "node",

  checks: { pluginTimings: false },
  publint: true,
});
