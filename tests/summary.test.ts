import { describe, expect, it } from "vitest";
import { defaultPrefs } from "../src/app/state";
import { parse } from "../src/lib/parser";
import { solve } from "../src/lib/solver";
import { buildMasks } from "../src/lib/timing";
import { preferredViolations, relaxedViolations, scheduleLabel } from "../src/lib/view/summary";
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
