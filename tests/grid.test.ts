import { describe, expect, it } from "vitest";
import { parse } from "../src/lib/parser";
import type { Schedule } from "../src/lib/solver";
import { buildMasks, type IndexedGroup } from "../src/lib/timing";
import { contiguousRuns, formatRanges, formatSession, groupIdOf, isFull } from "../src/lib/view/format";
import { assignLanes, blocksForWeek, describeBlock, periodRange, toGridBlocks, usedDays, weeksWithClasses } from "../src/lib/view/grid";
import { readFixture } from "./fixtureText";

const COURSES = buildMasks([...parse(readFixture("CO2007.txt")).courses, ...parse(readFixture("CO2011.txt")).courses]).courses;
const THEORY_WEEKS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16];

function byKey(key: string): IndexedGroup {
  const group = COURSES.flatMap((c) => c.groups).find((g) => g.key === key);
  if (!group) throw new Error(key);
  return group;
}

/** A schedule showing the given real groups, in this (course) order. */
function scheduleOf(groups: IndexedGroup[]): Schedule {
  return {
    picks: groups.map((group) => ({ courseCode: group.courseCode, group, alternatives: [] })),
    penalty: 0,
    score: 100,
    breakdown: [],
    violations: [],
  };
}

describe("toGridBlocks", () => {
  it("turns CO2007:A01_A01 + CO2011:A01 into blocks per session", () => {
    const blocks = toGridBlocks(scheduleOf([byKey("CO2007:A01_A01"), byKey("CO2011:A01")]));
    expect(blocks).toEqual([
      { day: 2, startPeriod: 2, endPeriod: 4, courseCode: "CO2007", groupId: "A01_A01", room: "A4-409", campus: 1, kind: "theory", weeks: THEORY_WEEKS, colorIndex: 0 },
      { day: 2, startPeriod: 8, endPeriod: 12, courseCode: "CO2007", groupId: "A01_A01", room: "C5-202", campus: 1, kind: "lab", weeks: [6, 10, 12, 14], colorIndex: 0 },
      { day: 6, startPeriod: 5, endPeriod: 6, courseCode: "CO2011", groupId: "A01", room: "B1-212", campus: 1, kind: "theory", weeks: THEORY_WEEKS, colorIndex: 1 },
    ]);
    expect(periodRange(blocks)).toEqual({ first: 2, last: 12 });
    expect(usedDays(blocks)).toEqual([2, 6]);
  });

  it("maps Sunday and keeps colors by course order", () => {
    const blocks = toGridBlocks(scheduleOf([byKey("CO2011:TN01"), byKey("CO2007:CC04_CC07")]));
    expect(usedDays(blocks)).toEqual([2, 3, 8]);
    expect(blocks.filter((b) => b.courseCode === "CO2011").every((b) => b.colorIndex === 0)).toBe(true);
    expect(blocks.find((b) => b.day === 8)).toMatchObject({ courseCode: "CO2007", startPeriod: 2, endPeriod: 6, kind: "lab", colorIndex: 1 });
  });

  it("splits a session whose periods have a gap", () => {
    // Derived: A01_A01's theory session edited from 2-4 to 2-3 and 5.
    const group = structuredClone(byKey("CO2007:A01_A01"));
    group.group.sessions[0].periods = [2, 3, 5];
    const theory = toGridBlocks(scheduleOf([group])).filter((b) => b.kind === "theory");
    expect(theory.map((b) => [b.startPeriod, b.endPeriod])).toEqual([[2, 3], [5, 5]]);
  });

  it("handles an empty schedule", () => {
    const blocks = toGridBlocks(scheduleOf([]));
    expect(blocks).toEqual([]);
    expect(periodRange(blocks)).toBeNull();
    expect(usedDays(blocks)).toEqual([]);
  });

  it("describes a block for tooltips", () => {
    const [, lab] = toGridBlocks(scheduleOf([byKey("CO2007:A01_A01")]));
    expect(describeBlock(lab)).toBe("CO2007 A01_A01 · Thứ 2 tiết 8–12 · C5-202 · CS1 · thí nghiệm tuần 6,10,12,14");
    expect(describeBlock(lab, true)).toBe("CO2007 A01_A01 · Thứ 2 tiết 8–12 · C5-202 · CS1 · thí nghiệm tuần 6,10,12,14 · đã khoá");
  });
});

describe("week selector helpers", () => {
  const blocks = toGridBlocks(scheduleOf([byKey("CO2007:A01_A01")]));
  const summary = (list: typeof blocks) => list.map((b) => `${b.kind} T${b.day} ${b.startPeriod}-${b.endPeriod}`);

  it("blocksForWeek: CO2007:A01_A01 has its Monday lab in week 6 but not in week 7, and nothing in week 8", () => {
    expect(summary(blocksForWeek(blocks, 6))).toEqual(["theory T2 2-4", "lab T2 8-12"]);
    expect(summary(blocksForWeek(blocks, 7))).toEqual(["theory T2 2-4"]);
    expect(blocksForWeek(blocks, 8)).toEqual([]); // the mid-term break
    expect(blocksForWeek(blocks, 17)).toEqual([]);
    expect(blocksForWeek(blocks, "all")).toBe(blocks);
  });

  it("weeksWithClasses lists the weeks of every block, ascending", () => {
    expect(weeksWithClasses(blocks)).toEqual(THEORY_WEEKS);
    expect(weeksWithClasses(blocks.filter((b) => b.kind === "lab"))).toEqual([6, 10, 12, 14]);
    // CC01_CC01's lab is on the other weeks: 7, 9, 11, 13.
    const labs = toGridBlocks(scheduleOf([byKey("CO2007:A01_A01"), byKey("CO2007:CC01_CC01")])).filter((b) => b.kind === "lab");
    expect(weeksWithClasses(labs)).toEqual([6, 7, 9, 10, 11, 12, 13, 14]);
    expect(weeksWithClasses([])).toEqual([]);
  });
});

describe("assignLanes", () => {
  it("puts alternating-week labs at the same time side by side", () => {
    // A01_A01's lab (weeks 6,10,12,14) and CC01_CC01's lab (weeks 7,9,11,13): both Mon 8-12.
    const blocks = toGridBlocks(scheduleOf([byKey("CO2007:A01_A01"), byKey("CO2007:CC01_CC01")]));
    const monday = assignLanes(blocks.filter((b) => b.day === 2));
    expect(monday.map((p) => [p.block.groupId, p.block.startPeriod, p.lane, p.lanes])).toEqual([
      ["A01_A01", 2, 0, 1], // theory 2-4 overlaps nothing: full width
      ["A01_A01", 8, 0, 2],
      ["CC01_CC01", 8, 1, 2],
    ]);
  });

  it("reuses a lane once a block has ended", () => {
    // CC04_CC07 theory Mon 7-9 overlaps A01_A01's lab 8-12; L02_L03 lab Mon 2-6 overlaps A01_A01's theory 2-4.
    const blocks = toGridBlocks(scheduleOf([byKey("CO2007:A01_A01"), byKey("CO2007:CC04_CC07"), byKey("CO2007:L02_L03")]));
    const monday = assignLanes(blocks.filter((b) => b.day === 2));
    expect(monday.map((p) => [p.block.groupId, p.block.startPeriod, p.lane, p.lanes])).toEqual([
      ["A01_A01", 2, 0, 2],
      ["L02_L03", 2, 1, 2],
      ["CC04_CC07", 7, 0, 2],
      ["A01_A01", 8, 1, 2],
    ]);
  });
});

describe("format helpers", () => {
  it("formats sessions like the registration page, T2..CN", () => {
    const [theory, lab] = byKey("CO2007:A01_A01").group.sessions;
    expect(formatSession(theory)).toBe("T2 · tiết 2–4 · A4-409 · CS1");
    expect(formatSession(lab)).toBe("T2 · tiết 8–12 · C5-202 · CS1 · TN tuần 6,10,12,14");
    expect(formatSession(byKey("CO2007:CC04_CC07").group.sessions[1])).toBe("CN · tiết 2–6 · C5-202 · CS1 · TN tuần 6,10,12,14");
    expect(formatSession(byKey("CO2011:L01").group.sessions[0])).toBe("T2 · tiết 2–3 · H1-210 · CS2");
  });

  it("formats ranges, keys and the full flag", () => {
    expect(contiguousRuns([4, 2, 3, 8])).toEqual([[2, 4], [8, 8]]);
    expect(formatRanges(THEORY_WEEKS)).toBe("1–7, 9–16");
    expect(groupIdOf("CO2007:L01_L02")).toBe("L01_L02");
    expect(isFull(byKey("CO2007:CC02_CC03").group)).toBe(true); // 40/40
    expect(isFull(byKey("CO2007:A01_A01").group)).toBe(false); // 34/40
  });
});
