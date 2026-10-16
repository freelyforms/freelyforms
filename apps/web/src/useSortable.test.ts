import { describe, expect, it } from "vitest";
import { finalIndex } from "./useSortable.js";

describe("finalIndex", () => {
  it.each([
    [0, 0, 0], // dropped on its own slot
    [0, 1, 0], // just below itself: no move
    [0, 3, 2], // to the end of three
    [2, 0, 0], // to the top
    [2, 1, 1],
    [1, 3, 2],
  ])("from %i inserting before %i ends at %i", (from, insertAt, expected) => {
    expect(finalIndex(from, insertAt)).toBe(expected);
  });
});
