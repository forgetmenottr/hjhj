import { describe, expect, it } from "vitest";
import { IMAGE_WIDTH, imageLayout, type ImageItem } from "../src/lib/export/image";
import { parse } from "../src/lib/parser";
import type { Schedule } from "../src/lib/solver";
import { buildMasks, type IndexedGroup } from "../src/lib/timing";
import { blocksForWeek, standardWeeks, toGridBlocks } from "../src/lib/view/grid";
import { readFixture } from "./fixtureText";

const PARSED = ["CO2007.txt", "CO2011.txt", "SK2001.txt"].flatMap((name) => parse(readFixture(name)).courses);
const COURSES = buildMasks(PARSED).courses;
const byKey = (key: string): IndexedGroup => COURSES.flatMap((c) => c.groups).find((g) => g.key === key)!;
const STANDARD = standardWeeks(PARSED);

function scheduleOf(keys: string[]): Schedule {
  return {
    picks: keys.map((key) => ({ courseCode: byKey(key).courseCode, group: byKey(key), alternatives: [] })),
    penalty: 0,
    score: 100,
    breakdown: [],
    violations: [],
  };
}

const SCHEDULE = scheduleOf(["CO2007:A01_A01", "CO2011:A01", "SK2001:A04"]);
const FRAME = toGridBlocks(SCHEDULE);
const LEGEND = SCHEDULE.picks.map((p, i) => ({ courseCode: p.courseCode, groupId: p.group.group.id, name: "", colorIndex: i }));
const texts = (items: ImageItem[]) => items.flatMap((item) => (item.kind === "text" ? [item.text] : []));
/** Block backgrounds: the rounded rectangles with radius 10. */
const blockRects = (items: ImageItem[]) => items.filter((item) => item.kind === "rect" && item.radius === 10);

describe("PNG layout", () => {
  it("is 1080 px wide, with a legend, the week note and one rectangle per block", () => {
    const layout = imageLayout({ blocks: FRAME, frame: FRAME, legend: LEGEND, weekNote: "Tất cả tuần", standard: STANDARD });
    expect(layout.width).toBe(IMAGE_WIDTH);
    expect(texts(layout.items)).toContain("Tất cả tuần");
    expect(texts(layout.items)).toEqual(expect.arrayContaining(["CO2007 · A01_A01", "CO2011 · A01", "SK2001 · A04"]));
    expect(blockRects(layout.items)).toHaveLength(FRAME.length);
    // The code has a line of its own; "TN", the room and week labels go below it.
    expect(texts(layout.items)).toEqual(expect.arrayContaining(["CO2007", "TN", "C5-202 · CS1", "tuần 6,10,12,14", "T12–16"]));
    for (const item of layout.items) {
      const { x, y } = item;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(layout.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(layout.height);
    }
  });

  it("draws one week inside the all-weeks frame, and says when the week is empty", () => {
    const all = imageLayout({ blocks: FRAME, frame: FRAME, legend: LEGEND, weekNote: "Tất cả tuần", standard: STANDARD });
    const week13 = imageLayout({ blocks: blocksForWeek(FRAME, 13), frame: FRAME, legend: LEGEND, weekNote: "Tuần 13", standard: STANDARD });
    const week8 = imageLayout({ blocks: blocksForWeek(FRAME, 8), frame: FRAME, legend: LEGEND, weekNote: "Tuần 8", standard: STANDARD });
    expect(week13.height).toBe(all.height); // same frame
    expect(blockRects(week13.items)).toHaveLength(3); // CO2007 theory, CO2011 theory, SK2001 A04 (no lab in week 13)
    expect(blockRects(week8.items)).toHaveLength(0);
    expect(texts(week8.items)).toContain("Tuần này không có lớp");
  });

  it("marks locked blocks with text, and a locked lab with both tags", () => {
    const layout = imageLayout({ blocks: FRAME, frame: FRAME, legend: LEGEND, weekNote: "", standard: STANDARD, isLocked: (b) => b.courseCode !== "SK2001" });
    expect(texts(layout.items).filter((t) => t === "Khoá")).toHaveLength(2); // CO2007 theory, CO2011
    expect(texts(layout.items)).toContain("TN · Khoá"); // CO2007 lab
  });
});
