import fs from "node:fs";
import type { CodegenConfig } from "@graphql-codegen/cli";

const schemaPath = "node_modules/.cache/github-graphql-schema.graphql";

if (process.env.CI || !fs.existsSync(schemaPath)) {
  const result = await fetch(
    "https://docs.github.com/public/fpt/schema.docs.graphql",
  );
  if (!result.ok) {
    throw new Error(
      `Failed to fetch GitHub GraphQL schema: ${result.status} ${result.statusText}`,
    );
  }
  fs.writeFileSync(schemaPath, await result.text());
}

const config: CodegenConfig = {
  schema: schemaPath,
  documents: ["src/github/graphql/queries.ts"],
  generates: {
    "src/github/graphql/generated/types.ts": {
      plugins: ["typescript"],
      config: {
        // TODO: Look into adding stricter types or use `unknown`
        defaultScalarType: "any",
      },
    },
    "src/github/graphql/generated/operations.ts": {
      plugins: ["typescript-operations"],
      config: {
        // TODO: Look into adding stricter types or use `unknown`
        defaultScalarType: "any",
        importSchemaTypesFrom: "src/github/graphql/generated/types.ts",
      },
    },
  },
};

export default config;
