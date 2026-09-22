import { describe, expect, it } from "vitest";
import { parse } from "../src/lib/parser";
import { formatCredits, formatRanges, formatWeeks } from "../src/lib/view/format";
import { standardWeeks } from "../src/lib/view/grid";
import { ALL_FIXTURES, readFixture } from "./fixtureText";

const FULL_TERM = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16];

describe("formatWeeks", () => {
  it("joins consecutive weeks into ranges", () => {
    expect(formatWeeks([1, 2, 3, 4, 5])).toBe("T1–5");
    expect(formatWeeks([12, 13, 14, 15, 16])).toBe("T12–16");
  });

  it("keeps gaps (the mid-term break) as separate ranges", () => {
    expect(formatWeeks([6, 7, 9, 10, 11])).toBe("T6–7, 9–11");
    expect(formatWeeks(FULL_TERM)).toBe("T1–7, 9–16");
    expect(formatWeeks([4, 6, 10, 12])).toBe("T4, 6, 10, 12");
  });

  it("handles a single week, unsorted or repeated input, and no weeks", () => {
    expect(formatWeeks([13])).toBe("T13");
    expect(formatWeeks([3, 1, 2, 2])).toBe("T1–3");
    expect(formatWeeks([])).toBe("");
    expect(formatRanges([])).toBe("");
  });
});

describe("formatCredits", () => {
  it("shows 0 as 0, not as missing", () => {
    expect(formatCredits(4)).toBe("4 TC");
    expect(formatCredits(0)).toBe("0 TC");
    expect(formatCredits(null)).toBe("? TC");
  });
});

describe("standardWeeks", () => {
  const courses = (names: string[]) => names.flatMap((name) => parse(readFixture(name)).courses);

  it("is the usual 15-week term for all fixtures", () => {
    expect(standardWeeks(courses(ALL_FIXTURES))).toEqual(FULL_TERM);
  });

  it("is not outvoted by one course with many short groups", () => {
    // SK2001 alone has 64 sessions in three 5-week patterns; CO2011 has 10 full-term ones.
    expect(standardWeeks(courses(["SK2001.txt", "CO2011.txt"]))).toEqual(FULL_TERM);
  });

  it("uses SK2001's most common pattern when it is the only course, and null without theory sessions", () => {
    expect(standardWeeks(courses(["SK2001.txt"]))).toEqual([1, 2, 3, 4, 5]);
    expect(standardWeeks([])).toBeNull();
  });
});
