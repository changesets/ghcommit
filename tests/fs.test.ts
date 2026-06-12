import { createFixture } from "fs-fixture";
import { describe, expect, it } from "vitest";
import { normalizeFileChanges } from "../src/fs.ts";

describe("normalizeFileChanges", () => {
  it("should convert file contents to base64", async () => {
    await using fixture = await createFixture({
      "foo.txt": "Hello, world!",
    });

    const result = await normalizeFileChanges(
      {
        additions: ["foo.txt"],
        deletions: ["bar.txt"],
      },
      fixture.path,
    );

    expect(result).toEqual({
      additions: [
        {
          path: "foo.txt",
          contents: await fixture.readFile("foo.txt", "base64"),
        },
      ],
      deletions: [{ path: "bar.txt" }],
    });
  });

  it("should pass through empty file changes", async () => {
    const result = await normalizeFileChanges(
      { additions: [], deletions: [] },
      "/",
    );

    expect(result).toEqual({ additions: [], deletions: [] });
  });
});
