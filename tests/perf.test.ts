import { describe, expect, it } from "vitest";
import { defaultPrefs } from "../src/app/state";
import { parse } from "../src/lib/parser";
import { solve, type Preferences } from "../src/lib/solver";
import { buildMasks, conflicts } from "../src/lib/timing";
import { ALL_FIXTURES, readFixture } from "./fixtureText";

// Performance SANITY check on the real fixtures, not a benchmark: the generous
// 3000 ms limit only catches order-of-magnitude regressions (before the
// conflict table and incremental scoring, the defaults took ~44 s here), so it
// should not flake on a slow CI machine. Measured numbers are in the report.

const COURSES = buildMasks(ALL_FIXTURES.flatMap((name) => parse(readFixture(name)).courses)).courses;

function prefs(edit: (p: Preferences) => void): Preferences {
  const p = defaultPrefs();
  edit(p);
  return p;
}

const CASES: [string, Preferences][] = [
  ["app defaults", defaultPrefs()],
  [
    "every weight at 10, nothing required",
    prefs((p) => {
      p.freeSeats.mode = "off";
      p.weights = { timeOfDay: { prefer: "afternoon", weight: 10 }, fewerDays: 10, compactDays: 10, noCampusSwitch: 10, avoidEarly: 10, preferredItems: 10 };
    }),
  ],
  [
    "campuses required [1] + days off required [Thứ 2]",
    prefs((p) => {
      p.campuses = { mode: "required", allowed: [1] };
      p.daysOff = { mode: "required", days: [2] };
    }),
  ],
  ["free seats required", prefs((p) => void (p.freeSeats.mode = "required"))],
];

describe(`solver on all ${ALL_FIXTURES.length} real fixtures (sanity check)`, () => {
  it("has at least 5 courses", () => {
    expect(COURSES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(CASES)("%s: under 3000 ms, complete, conflict-free", (_, p) => {
    const result = solve(COURSES, p);
    console.log(`[perf] ${_}: status=${result.status} nodes=${result.stats.nodes} ms=${result.stats.ms.toFixed(0)}`);
    expect(result.stats.ms).toBeLessThan(3000);
    expect(result.stats.truncated).toBe(false);
    expect(result.schedules.length).toBeGreaterThan(0);
    for (const schedule of result.schedules) {
      const groups = schedule.picks.map((pick) => pick.group);
      expect(groups).toHaveLength(COURSES.length);
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) expect(conflicts(groups[i], groups[j])).toBe(false);
      }
    }
  });
});
