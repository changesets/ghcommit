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
      ".gitignore": ".env\nignored",
      "a.txt": "Hello, world!",
      "b.txt": "Hello, world!",
    });
    await setupGit(fixture.path);

    await fixture.writeFile("a.txt", "This is an updated file!");
    await fixture.rm("b.txt");
    await fixture.writeFile("c.txt", "This is a new file!");
    await fixture.mkdir("nested");
    await fixture.writeFile("nested/file.txt", "This is a nested file");
    await fixture.mkdir("ignored");
    await fixture.writeFile("ignored/file.txt", "This file should be ignored");
    await fixture.writeFile(".env", "This file should be ignored");

    const result = await getFileChanges(fixture.path, fixture.path, "HEAD");
    expect(result).toEqual({
      additions: [
        {
          path: "a.txt",
          contents: await fixture.readFile("a.txt", "base64"),
        },
        {
          path: "c.txt",
          contents: await fixture.readFile("c.txt", "base64"),
        },
        {
          path: "nested/file.txt",
          contents: await fixture.readFile("nested/file.txt", "base64"),
        },
      ],
      deletions: [{ path: "b.txt" }],
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

  it("should allow existing symlinks", async () => {
    await using fixture = await createFixture({
      "foo.txt": "Hello, world!",
      "bar.txt": "Hello, world!",
    });
    await setupGit(fixture.path);

    await fixture.mkdir("some-dir");
    await fs.symlink(
      fixture.getPath("foo.txt"),
      fixture.getPath("some-dir/nested"),
    );
    await exec("git", ["add", "."], { nodeOptions: { cwd: fixture.path } });
    await exec("git", ["commit", "-m", "Add symlink"], {
      nodeOptions: { cwd: fixture.path },
    });

    // Since we committed, HEAD points to the last commit and there's no change since then
    const result = await getFileChanges(fixture.path, fixture.path, "HEAD");
    expect(result).toEqual({ additions: [], deletions: [] });

    await fixture.rm("some-dir/nested");
    await fs.symlink(
      fixture.getPath("bar.txt"),
      fixture.getPath("some-dir/nested"),
    );

    // We made symlink changes since the last commit, so this should error now
    await expect(
      getFileChanges(fixture.path, fixture.path, "HEAD"),
    ).rejects.toThrow(
      "Unexpected symlink at some-dir/nested, GitHub API only supports files and directories. You may need to add this file to .gitignore",
    );
  });

  it("should not error when symlink is present but ignored", async () => {
    await using fixture = await createFixture({
      "foo.txt": "Hello, world!",
    });
    await setupGit(fixture.path);

    await fixture.writeFile(".gitignore", "some-dir");
    await exec("git", ["add", "."], { nodeOptions: { cwd: fixture.path } });
    await exec("git", ["commit", "-m", "Add gitignore"], {
      nodeOptions: { cwd: fixture.path },
    });

    await fixture.mkdir("some-dir");
    await fs.symlink(
      fixture.getPath("foo.txt"),
      fixture.getPath("some-dir/nested"),
    );

    const result = await getFileChanges(fixture.path, fixture.path, "HEAD");
    expect(result).toEqual({ additions: [], deletions: [] });
  });

  it("should throw error when symlink is present with non-existent path", async () => {
    await using fixture = await createFixture();
    await setupGit(fixture.path);

    await fixture.mkdir("some-dir");
    await fs.symlink(
      fixture.getPath("non-existent"),
      fixture.getPath("some-dir/nested"),
    );

    await expect(
      getFileChanges(fixture.path, fixture.path, "HEAD"),
    ).rejects.toThrow(
      "Unexpected symlink at some-dir/nested, GitHub API only supports files and directories. You may need to add this file to .gitignore",
    );
  });

  it("should throw error when symlink is present with existing path", async () => {
    await using fixture = await createFixture({
      "foo.txt": "Hello, world!",
    });
    await setupGit(fixture.path);

    await fixture.mkdir("some-dir");
    await fs.symlink(
      fixture.getPath("foo.txt"),
      fixture.getPath("some-dir/nested"),
    );

    await expect(
      getFileChanges(fixture.path, fixture.path, "HEAD"),
    ).rejects.toThrow(
      "Unexpected symlink at some-dir/nested, GitHub API only supports files and directories. You may need to add this file to .gitignore",
    );
  });

  it("should throw error when executable file is present", async () => {
    await using fixture = await createFixture();
    await setupGit(fixture.path);

    await fixture.writeFile("executable-file.sh", "#!/bin/bash\necho hello");
    await fs.chmod(fixture.getPath("executable-file.sh"), 0o755);

    await expect(
      getFileChanges(fixture.path, fixture.path, "HEAD"),
    ).rejects.toThrow(
      "Unexpected executable file at executable-file.sh, GitHub API only supports non-executable files and directories. You may need to add this file to .gitignore",
    );
  });
});
