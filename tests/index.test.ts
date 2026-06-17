import { expect, it } from "vitest";
import * as indexBrowser from "../src/index-browser.ts";
import * as indexNode from "../src/index-node.ts";

it("should export the same functions in both browser and node versions", () => {
  expect(Object.keys(indexBrowser)).toEqual(Object.keys(indexNode));
});
