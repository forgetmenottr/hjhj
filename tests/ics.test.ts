import { describe, expect, it } from "vitest";
import { parse } from "../src/lib/parser";
import type { Schedule } from "../src/lib/solver";
import { dateOf, escapeText, foldLine, icsEvents, mondayOf, scheduleToIcs } from "../src/lib/export/ics";
import { PERIOD_TIMES } from "../src/lib/export/periods";
import { contiguousRuns } from "../src/lib/view/format";
import { buildMasks, type IndexedGroup } from "../src/lib/timing";
import { readFixture } from "./fixtureText";

const COURSES = buildMasks(["CO2007.txt", "CO2011.txt", "SK2001.txt"].flatMap((name) => parse(readFixture(name)).courses)).courses;
const NAMES = Object.fromEntries(COURSES.map((c) => [c.code, c.name]));
const byKey = (key: string): IndexedGroup => COURSES.flatMap((c) => c.groups).find((g) => g.key === key)!;

function scheduleOf(keys: string[]): Schedule {
  return {
    picks: keys.map((key) => ({ courseCode: byKey(key).courseCode, group: byKey(key), alternatives: [] })),
    penalty: 0,
    score: 100,
    breakdown: [],
    violations: [],
  };
}

/** A Monday. */
const START = "2026-09-07";
const STAMP = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
const OPTIONS = { semesterStart: START, courseNames: NAMES, stamp: STAMP };

describe("period times", () => {
  it("period n runs (n+5):00–(n+5):50", () => {
    expect(PERIOD_TIMES[1]).toEqual({ start: "06:00", end: "06:50" });
    expect(PERIOD_TIMES[2]).toEqual({ start: "07:00", end: "07:50" });
    expect(PERIOD_TIMES[16]).toEqual({ start: "21:00", end: "21:50" });
    expect(Object.keys(PERIOD_TIMES)).toHaveLength(16);
  });
});

describe("dates", () => {
  it("counts weeks and days from the Monday of week 1", () => {
    expect(dateOf(START, 1, 2)).toBe("2026-09-07"); // Thứ 2, week 1
    expect(dateOf(START, 1, 8)).toBe("2026-09-13"); // Chủ nhật, week 1
    expect(dateOf(START, 13, 5)).toBe("2026-12-03"); // Thứ 5, week 13
  });

  it("moves another day of the week back to its Monday, and rejects invalid dates", () => {
    expect(mondayOf("2026-09-10")).toBe("2026-09-07"); // a Thursday
    expect(mondayOf("2026-09-13")).toBe("2026-09-07"); // a Sunday
    expect(mondayOf("2026-02-30")).toBeNull();
    expect(dateOf("nope", 1, 2)).toBeNull();
  });
});

describe("icsEvents", () => {
  it("makes one event per session run per week (CO2007:A01_A01 + CO2011:A01 + SK2001:A04)", () => {
    const schedule = scheduleOf(["CO2007:A01_A01", "CO2011:A01", "SK2001:A04"]);
    const expected = schedule.picks
      .flatMap((p) => p.group.group.sessions)
      .reduce((sum, s) => sum + contiguousRuns(s.periods).length * s.weeks.length, 0);
    expect(expected).toBe(15 + 4 + 15 + 5); // A01_A01 theory + lab, CO2011 theory, SK2001 5 weeks
    const events = icsEvents(schedule, OPTIONS);
    expect(events).toHaveLength(expected);
    expect(new Set(events.map((e) => e.uid)).size).toBe(events.length);
  });

  it("CO2007:A01_A01, Monday periods 2–4 of week 1 → 07:00–09:50 on the semester start", () => {
    const [first] = icsEvents(scheduleOf(["CO2007:A01_A01"]), OPTIONS);
    expect(first).toEqual({
      uid: "CO2007-A01_A01-d2-p2-w1@tkb-hcmut",
      date: "20260907",
      start: "070000",
      end: "095000",
      summary: "CO2007 · Kiến trúc máy tính",
      location: "A4-409 · CS1",
      description: "Nhóm A01_A01",
    });
  });

  it("marks labs with (TN) and puts them in their own weeks", () => {
    const labs = icsEvents(scheduleOf(["CO2007:A01_A01"]), OPTIONS).filter((e) => e.summary.endsWith("(TN)"));
    expect(labs.map((e) => e.date)).toEqual(["20261012", "20261109", "20261123", "20261207"]); // weeks 6, 10, 12, 14
    expect(labs[0]).toMatchObject({ start: "130000", end: "175000", location: "C5-202 · CS1" }); // periods 8–12
  });

  it("gives SK2001:A04 (Thu 2–4, weeks 12–16) events in those 5 weeks only", () => {
    const events = icsEvents(scheduleOf(["SK2001:A04"]), OPTIONS);
    expect(events.map((e) => e.date)).toEqual(["20261126", "20261203", "20261210", "20261217", "20261224"]);
    expect(events[0]).toMatchObject({ start: "070000", end: "095000", summary: "SK2001 · Kỹ năng Tư duy khoa học" });
  });
});

describe("scheduleToIcs", () => {
  const text = scheduleToIcs(scheduleOf(["CO2007:A01_A01", "CO2011:A01"]), OPTIONS);
  const lines = text.split("\r\n");

  it("uses CRLF line endings only, and ends with one", () => {
    expect(text.endsWith("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("has a calendar with a +07:00 time zone and one VEVENT per meeting", () => {
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("TZID:Asia/Ho_Chi_Minh");
    expect(lines).toContain("TZOFFSETTO:+0700");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(15 + 4 + 15);
    expect(lines).toContain("DTSTART;TZID=Asia/Ho_Chi_Minh:20260907T070000");
    expect(lines).toContain("DTEND;TZID=Asia/Ho_Chi_Minh:20260907T095000");
    expect(lines).toContain("DTSTAMP:20260922T120000Z");
    expect(lines).toContain("SUMMARY:CO2011 · Mô hình hóa toán học");
    expect(lines[lines.length - 2]).toBe("END:VCALENDAR");
  });

  it("keeps every line within 75 octets", () => {
    const octets = (line: string) => new TextEncoder().encode(line).length;
    expect(Math.max(...lines.map(octets))).toBeLessThanOrEqual(75);
  });
});

describe("escaping and folding", () => {
  it("escapes backslash, semicolon, comma and newlines", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("folds at 75 octets without splitting a character, and unfolds to the original", () => {
    const long = `SUMMARY:${"Kỹ năng Tư duy khoa học · ".repeat(6)}`;
    const folded = foldLine(long);
    expect(folded.length).toBeGreaterThan(1);
    for (const line of folded) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((line) => line.startsWith(" "))).toBe(true);
    expect(folded.map((line, i) => (i === 0 ? line : line.slice(1))).join("")).toBe(long);
    expect(foldLine("SHORT")).toEqual(["SHORT"]);
  });
});
