import fs from "fs/promises";

export async function teardown() {
  const directory = process.env.ROOT_TEMP_DIRECTORY;
  if (!directory) {
    throw new Error("ROOT_TEMP_DIRECTORY must be set");
  }

  console.log(`Deleting directory: ${directory}`);

  await fs.rm(directory, { force: true, recursive: true }).catch((error) => {
    console.error(`Error deleting directory: ${error}`);
  });
}
