import fs from "node:fs/promises";
import path from "node:path";
import { createFixture } from "fs-fixture";
import { exec } from "tinyexec";
import { describe, expect, it } from "vitest";
import { getFileChanges } from "../src/git.ts";

async function setupGit(cwd: string) {
  await exec("git", ["init"], { nodeOptions: { cwd } });
  await fs.appendFile(
    path.join(cwd, ".git/config"),
    `\
[user]
    email = x@y.z
    name = xyz
[commit]
    gpgSign = false
[tag]
    gpgSign = false
    forceSignAnnotated = false`,
    "utf8",
  );
  await exec("git", ["add", "."], { nodeOptions: { cwd } });
  await exec("git", ["commit", "-m", "initial commit", "--allow-empty"], {
    nodeOptions: { cwd },
  });
}

describe("getFileChanges", () => {
  it("should get changes since a specific ref", async () => {
    await using fixture = await createFixture({
      "foo.txt": "Hello, world!",
    });
    await setupGit(fixture.path);

    await fixture.rm("foo.txt");
    await fixture.writeFile("bar.txt", "This is a new file!");

    const result = await getFileChanges(fixture.path, fixture.path, "HEAD");
    expect(result).toEqual({
      additions: [
        {
          path: "bar.txt",
          contents: await fixture.readFile("bar.txt", "base64"),
        },
      ],
      deletions: [{ path: "foo.txt" }],
    });
  });

  it("should filter files with filterFiles", async () => {
    await using fixture = await createFixture({
      "foo.txt": "Hello, world!",
      "nested/foo.txt": "Hello, world!",
    });
    await setupGit(fixture.path);

    await fixture.rm("foo.txt");
    await fixture.rm("nested/foo.txt");
    await fixture.writeFile("bar.txt", "This is a new file!");
    await fixture.writeFile("nested/bar.txt", "This is a new file!");

    const result = await getFileChanges(
      fixture.path,
      fixture.path,
      "HEAD",
      // Only include top-level files
      (file) => !file.includes("/"),
    );
    expect(result).toEqual({
      additions: [
        {
          path: "bar.txt",
          contents: await fixture.readFile("bar.txt", "base64"),
        },
      ],
      deletions: [{ path: "foo.txt" }],
    });
  });

  it("should filter files when running in a repository sub-directory", async () => {
    await using fixture = await createFixture({
      "foo.txt": "Hello, world!",
      "nested/foo.txt": "Hello, world!",
    });
    await setupGit(fixture.path);

    await fixture.rm("foo.txt");
    await fixture.rm("nested/foo.txt");
    await fixture.writeFile("bar.txt", "This is a new file!");
    await fixture.writeFile("nested/bar.txt", "This is a new file!");

    const result = await getFileChanges(
      path.join(fixture.path, "nested"),
      fixture.path,
      "HEAD",
    );
    expect(result).toEqual({
      additions: [
        {
          path: "nested/bar.txt",
          contents: await fixture.readFile("nested/bar.txt", "base64"),
        },
      ],
      deletions: [{ path: "nested/foo.txt" }],
    });
  });
});
