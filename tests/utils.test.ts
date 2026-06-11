import { describe, expect, it } from "vitest";
import { normalizeCommitMessage } from "../src/utils.ts";

describe("normalizeCommitMessage", () => {
  it("handles single line messages", () => {
    const message = "This is a commit message";
    const result = normalizeCommitMessage(message);
    expect(result).toEqual({ headline: "This is a commit message" });
  });

  it("handles multi line messages", () => {
    const message =
      "This is a commit message\nwith a second line\nand a third line";
    const result = normalizeCommitMessage(message);
    expect(result).toEqual({
      headline: "This is a commit message",
      body: "with a second line\nand a third line",
    });
  });

  it("trims whitespace from headline and body", () => {
    const message = "  This is a commit message  \n  with a second line  ";
    const result = normalizeCommitMessage(message);
    expect(result).toEqual({
      headline: "This is a commit message",
      body: "with a second line",
    });
  });

  it("handles object messages", () => {
    const message = {
      headline: "  This is a commit message  ",
      body: "  with a second line  ",
    };
    const result = normalizeCommitMessage(message);
    expect(result).toEqual({
      headline: "This is a commit message",
      body: "with a second line",
    });
  });
});
