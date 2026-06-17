---
"@changesets/ghcommit": major
---

Removed the `commitFilesFromBuffers` and `commitFilesFromDirectory` APIs. These APIs were simple wrappers over the core `commitChangesFromBase64` API, which should be used instead. Read the file and pass the base64-encoded content to `commitChangesFromBase64` `fileChanges` directly. For example:

- `Buffer.from("hello world").toString("base64")`
- `await fs.readFile("path/to/file", "base64")`
