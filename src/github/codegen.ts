import fs from "node:fs";
import path from "node:path";
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
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(schemaPath, await result.text());
}

const scalars = {
  Base64String: "string",
  BigInt: "string",
  CustomPropertyValue: "string",
  Date: "string",
  DateTime: "string",
  GitObjectID: "string",
  GitRefname: "string",
  GitSSHRemote: "string",
  GitTimestamp: "string",
  HTML: "string",
  PreciseDateTime: "string",
  URI: "string",
  X509Certificate: "string",
};

const config: CodegenConfig = {
  schema: schemaPath,
  documents: ["src/github/graphql/queries.ts"],
  generates: {
    "src/github/graphql/generated/types.ts": {
      plugins: ["typescript"],
      config: {
        scalars,
        strictScalars: true,
        enumsAsTypes: true,
      },
    },
    "src/github/graphql/generated/operations.ts": {
      plugins: ["typescript-operations"],
      config: {
        scalars,
        strictScalars: true,
        importSchemaTypesFrom: "src/github/graphql/generated/types.ts",
        importExtension: ".ts",
      },
    },
  },
};

export default config;
