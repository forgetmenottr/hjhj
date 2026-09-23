import { describe, expect, it } from "vitest";
import { defaultPrefs } from "../src/app/state";
import { parse } from "../src/lib/parser";
import { solve } from "../src/lib/solver";
import { buildMasks } from "../src/lib/timing";
import { STALE_PASTE_MS } from "../src/lib/view/format";
import { preferredViolations, relaxedViolations, scheduleLabel, staleCourses } from "../src/lib/view/summary";
import { readFixture } from "./fixtureText";

const COURSES = buildMasks([...parse(readFixture("CO2007.txt")).courses, ...parse(readFixture("CO2011.txt")).courses]).courses;

describe("relaxed schedules are not shown by their score", () => {
  it("labels schedules that break relaxed requirements with ⚠ instead of the score", () => {
    // No group is both on CS2 and taught in English, so both requirements are relaxed.
    const prefs = defaultPrefs();
    prefs.campuses = { mode: "required", allowed: [2] };
    prefs.language = { mode: "required", allowed: ["TA"] };
    const result = solve(COURSES, prefs);
    expect(result.status).toBe("relaxed");
    expect(result.relaxed).toEqual(["campuses", "language"]);

    result.schedules.forEach((schedule, i) => {
      const broken = relaxedViolations(schedule, result.relaxed);
      expect(broken).toHaveLength(1); // each schedule gives up one of the two
      expect(broken[0].courses).toEqual(["CO2007", "CO2011"]);
      expect(schedule.score).toBeGreaterThan(90); // the score alone would look fine
      expect(scheduleLabel(schedule, i, result.relaxed)).toBe(`Lịch ${i + 1} · ⚠ 1 yêu cầu`);
    });
  });

  it("keeps the score label when nothing was relaxed, and splits preferred violations out", () => {
    const prefs = defaultPrefs();
    prefs.language = { mode: "preferred", allowed: ["TA"] };
    const result = solve(COURSES, prefs);
    expect(result.status).toBe("ok");
    const [first] = result.schedules;
    expect(scheduleLabel(first, 0, result.relaxed)).toBe(`Lịch 1 · ${first.score} điểm`);
    expect(relaxedViolations(first, result.relaxed)).toEqual([]);
    expect(preferredViolations(first, result.relaxed)).toEqual(first.violations);
  });
});

// ---------------------------------------------------------------------------
// Stale pastes (Phase 7). The banner in steps 4-5 shows when any course the
// schedule uses was pasted more than STALE_PASTE_MS ago.
// ---------------------------------------------------------------------------

describe("staleCourses", () => {
  const NOW = Date.parse("2026-09-23T10:00:00.000Z");
  const ago = (ms: number) => new Date(NOW - ms).toISOString();
  const schedule = solve(COURSES, defaultPrefs()).schedules[0];

  it("lists nothing while every course of the schedule is fresh", () => {
    expect(schedule.picks.map((p) => p.courseCode)).toEqual(["CO2007", "CO2011"]);
    const fresh = { CO2007: ago(0), CO2011: ago(STALE_PASTE_MS - 1000) };
    expect(staleCourses(schedule, fresh, NOW)).toEqual([]);
  });

  it("names only the courses whose data is old, in pick order", () => {
    expect(staleCourses(schedule, { CO2007: ago(STALE_PASTE_MS), CO2011: ago(0) }, NOW)).toEqual(["CO2007"]);
    expect(staleCourses(schedule, { CO2007: ago(0), CO2011: ago(3 * 3_600_000) }, NOW)).toEqual(["CO2011"]);
    expect(staleCourses(schedule, { CO2007: ago(86_400_000), CO2011: ago(86_400_000) }, NOW)).toEqual(["CO2007", "CO2011"]);
  });

  it("treats an unknown or missing timestamp as stale (a save from before Phase 7)", () => {
    expect(staleCourses(schedule, { CO2007: null, CO2011: ago(0) }, NOW)).toEqual(["CO2007"]);
    expect(staleCourses(schedule, {}, NOW)).toEqual(["CO2007", "CO2011"]);
  });

  it("ignores courses the schedule does not use", () => {
    expect(staleCourses(schedule, { CO2007: ago(0), CO2011: ago(0), SK2001: null }, NOW)).toEqual([]);
  });
});
