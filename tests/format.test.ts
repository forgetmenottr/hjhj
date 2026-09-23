import { describe, expect, it } from "vitest";
import { parse, programOf, type Group } from "../src/lib/parser";
import {
  formatAge,
  formatCredits,
  formatRanges,
  formatWeeks,
  isStalePaste,
  programBadge,
  programCounts,
  programOptionLabel,
  STALE_PASTE_MS,
} from "../src/lib/view/format";
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

// ---------------------------------------------------------------------------
// Program track (Phase 7)
// ---------------------------------------------------------------------------

describe("programOf", () => {
  const groups = (name: string) => parse(readFixture(name)).courses[0].groups;
  const byId = (name: string, id: string): Group => groups(name).find((g) => g.id === id)!;

  it("reads the leading letters of the theory group, for each of the four known programs", () => {
    expect(programOf(byId("CO2007.txt", "L01_L02"))).toBe("L"); // theory group L01
    expect(programOf(byId("CO2011.txt", "A01"))).toBe("A"); // no practice group
    expect(programOf(byId("CO2007.txt", "CC04_CC07"))).toBe("CC");
    expect(programOf(byId("CO2007.txt", "TN01_TN01"))).toBe("TN");
  });

  it("keeps an unknown prefix as it is, and labels it “Khác”", () => {
    // Derived from CO2007:L01_L02 — the same shape with a prefix HCMUT does not use here.
    expect(programOf({ theoryGroup: "XY01" })).toBe("XY");
    expect(programBadge({ theoryGroup: "XY01" })).toBe("XY · Khác");
    expect(programBadge({ theoryGroup: "" })).toBe("Khác"); // no letters at all
  });

  it("names the four known programs", () => {
    expect(programBadge(byId("CO2007.txt", "L01_L02"))).toBe("L · đại trà");
    expect(programBadge(byId("CO2011.txt", "A01"))).toBe("A · Tiếng Nhật / Việt-Pháp");
    expect(programBadge(byId("CO2007.txt", "CC04_CC07"))).toBe("CC · chất lượng cao");
    expect(programBadge(byId("CO2007.txt", "TN01_TN01"))).toBe("TN · tài năng");
  });
});

describe("programCounts on the real fixtures", () => {
  const courses = (names: string[]) => names.flatMap((name) => parse(readFixture(name)).courses);

  it("counts the groups of each program, known codes first", () => {
    expect(programCounts(courses(["CO2007.txt"]))).toEqual([
      { code: "L", count: 8 },
      { code: "A", count: 2 },
      { code: "CC", count: 7 },
      { code: "TN", count: 1 },
    ]);
    // Totals add up to the 18 groups of CO2007.
    expect(programCounts(courses(["CO2007.txt"])).reduce((sum, p) => sum + p.count, 0)).toBe(18);
  });

  it("shows only the programs a course actually has", () => {
    // SK2001 has no L and no TN group at all — the case behind the missing-program diagnostic.
    expect(programCounts(courses(["SK2001.txt"]))).toEqual([
      { code: "A", count: 4 },
      { code: "CC", count: 60 },
    ]);
    expect(programCounts([])).toEqual([]);
  });

  it("sums across every fixture", () => {
    expect(programCounts(courses(ALL_FIXTURES))).toEqual([
      { code: "L", count: 28 },
      { code: "A", count: 15 },
      { code: "CC", count: 90 },
      { code: "TN", count: 3 },
    ]);
  });

  it("labels one choice of the program card", () => {
    expect(programOptionLabel({ code: "L", count: 18 })).toBe("L — đại trà (18 nhóm)");
    expect(programOptionLabel({ code: "CC", count: 60 })).toBe("CC — chất lượng cao (60 nhóm)");
  });
});

// ---------------------------------------------------------------------------
// Paste age (Phase 7). `now` is always passed in, so these are deterministic.
// ---------------------------------------------------------------------------

describe("formatAge", () => {
  const NOW = Date.parse("2026-09-23T10:00:00.000Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  const minutes = (n: number) => n * 60_000;
  const hours = (n: number) => n * 3_600_000;
  const days = (n: number) => n * 86_400_000;

  it("under a minute is “vừa xong”", () => {
    expect(formatAge(ago(0), NOW)).toBe("vừa xong");
    expect(formatAge(ago(59_000), NOW)).toBe("vừa xong");
    expect(formatAge(ago(minutes(1)), NOW)).toBe("1 phút trước");
  });

  it("counts whole minutes, then whole hours", () => {
    expect(formatAge(ago(minutes(12)), NOW)).toBe("12 phút trước");
    expect(formatAge(ago(minutes(59)), NOW)).toBe("59 phút trước");
    expect(formatAge(ago(hours(1)), NOW)).toBe("1 giờ trước");
    expect(formatAge(ago(hours(5) + minutes(30)), NOW)).toBe("5 giờ trước");
    expect(formatAge(ago(hours(23)), NOW)).toBe("23 giờ trước");
  });

  it("one day is “hôm qua”, more are counted", () => {
    expect(formatAge(ago(days(1)), NOW)).toBe("hôm qua");
    expect(formatAge(ago(days(1) + hours(23)), NOW)).toBe("hôm qua");
    expect(formatAge(ago(days(3)), NOW)).toBe("3 ngày trước");
  });

  it("is “không rõ thời điểm” without a usable timestamp, and never negative", () => {
    expect(formatAge(null, NOW)).toBe("không rõ thời điểm");
    expect(formatAge("not a date", NOW)).toBe("không rõ thời điểm");
    // A clock that went backwards must not read as a future paste.
    expect(formatAge(new Date(NOW + minutes(5)).toISOString(), NOW)).toBe("vừa xong");
  });

  it("isStalePaste flips exactly at 30 minutes, and an unknown age counts as stale", () => {
    expect(STALE_PASTE_MS).toBe(30 * 60 * 1000);
    expect(isStalePaste(ago(STALE_PASTE_MS - 1), NOW)).toBe(false);
    expect(isStalePaste(ago(STALE_PASTE_MS), NOW)).toBe(true);
    expect(isStalePaste(ago(hours(2)), NOW)).toBe(true);
    expect(isStalePaste(null, NOW)).toBe(true); // a save from before timestamps existed
  });
});
