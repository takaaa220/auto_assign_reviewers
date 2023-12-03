import { describe, it, expect } from "vitest";
import { parseLabelsInput, findReviewerByLabels } from "./index.mjs";

describe("findReviewerByLabels", () => {
  describe("success", () => {
    it.each([
      {
        name: "found only one mapping pair",
        labels: ["label1"],
        assignMappingsStr: "label1:[reviewer1,reviewer2], label2:[reviewer3]",
        getRandomInt: () => 0,
        expected: "reviewer1",
      },
      {
        name: "found multiple mapping pairs",
        labels: ["label1", "label2"],
        assignMappingsStr: "label1:[reviewer1,reviewer2], label2:[reviewer3]",
        getRandomInt: () => 2,
        expected: "reviewer3",
      },
      {
        name: "empty labels",
        labels: [],
        assignMappingsStr: "label1:[reviewer1,reviewer2], label2:[reviewer3]",
        getRandomInt: () => 0,
        expected: undefined,
      },
      {
        name: "unknown label",
        labels: ["label-unknown"],
        assignMappingsStr: "label1:[reviewer1,reviewer2], label2:[reviewer3]",
        getRandomInt: () => 0,
        expected: undefined,
      },
    ])("$name", ({ labels, assignMappingsStr, getRandomInt, expected }) => {
      const got = findReviewerByLabels(labels, assignMappingsStr, getRandomInt);

      expect(got).toBe(expected);
    });
  });
});

describe("parseLabelsInput", () => {
  it("valid", () => {
    const res = parseLabelsInput(
      "label1:[reviewer1,reviewer2, reviewer 3],label2:[reviewer3]"
    );
    expect(res).toEqual({
      label1: ["reviewer1", "reviewer2", "reviewer 3"],
      label2: ["reviewer3"],
    });
  });

  describe("invalid", () => {
    it("format is invalid", () => {
      expect(() => parseLabelsInput("label1:reviewer1")).toThrow(
        `Each pair must be in the format "label1:[reviewer1,reviewer2]".`
      );
    });

    it("reviewers is empty", () => {
      expect(() => parseLabelsInput("label1:[],label2:[reviewer1]")).toThrow(
        `reviewers must not be empty. Each pair must be in the format "label1:[reviewer1,reviewer2]"`
      );
    });
  });
});
