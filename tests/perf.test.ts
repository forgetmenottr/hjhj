import { describe, expect, it } from "vitest";
import { defaultPrefs } from "../src/app/state";
import { parse } from "../src/lib/parser";
import { solve, type Preferences } from "../src/lib/solver";
import { buildMasks, conflicts, type IndexedCourse } from "../src/lib/timing";
import { ALL_FIXTURES, readFixture } from "./fixtureText";

// Performance SANITY check on the real fixtures, not a benchmark: the generous
// 3000 ms limit only catches order-of-magnitude regressions (before the
// conflict table and incremental scoring, the defaults took ~44 s here), so it
// should not flake on a slow CI machine. Measured numbers are in the report.

const COURSES = buildMasks(ALL_FIXTURES.flatMap((name) => parse(readFixture(name)).courses)).courses;

// 8-course bench: the six real fixtures plus two clones DERIVED from real
// fixtures, not invented. Each clone is a fixture's text copied verbatim with
// only its course code rewritten (CO2007 → CO2907, CO2011 → CO2911), so it has
// exactly the same groups and timetable as its original and must take a
// different, non-clashing group: a harder search than six distinct courses.
const CLONES: [file: string, code: string, cloneCode: string][] = [
  ["CO2007.txt", "CO2007", "CO2907"],
  ["CO2011.txt", "CO2011", "CO2911"],
];
const COURSES_8 = buildMasks([
  ...ALL_FIXTURES.flatMap((name) => parse(readFixture(name)).courses),
  ...CLONES.flatMap(([file, code, cloneCode]) => parse(readFixture(file).replaceAll(code, cloneCode)).courses),
]).courses;

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
  // CC is the only program every fixture has (SK2001 has no L and no TN group).
  ["programs required [CC]", prefs((p) => { p.programs = { mode: "required", allowed: ["CC"] }; })],
];

function checkCase(label: string, courses: IndexedCourse[], p: Preferences, truncated = false): void {
  const result = solve(courses, p);
  console.log(`[perf] ${label}: status=${result.status} nodes=${result.stats.nodes} ms=${result.stats.ms.toFixed(0)}`);
  expect(result.stats.ms).toBeLessThan(3000);
  expect(result.stats.truncated).toBe(truncated);
  expect(result.schedules.length).toBeGreaterThan(0);
  for (const schedule of result.schedules) {
    const groups = schedule.picks.map((pick) => pick.group);
    expect(groups).toHaveLength(courses.length);
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) expect(conflicts(groups[i], groups[j])).toBe(false);
    }
  }
}

describe(`solver on all ${ALL_FIXTURES.length} real fixtures (sanity check)`, () => {
  it("has at least 5 courses", () => {
    expect(COURSES.length).toBeGreaterThanOrEqual(5);
  });

  it.each(CASES)("%s: under 3000 ms, complete, conflict-free", (label, p) => checkCase(label, COURSES, p));
});

describe("solver on 8 courses: the fixtures plus 2 derived clones (sanity check)", () => {
  it("has 8 courses", () => {
    expect(COURSES_8.map((course) => course.code)).toEqual([...COURSES.map((course) => course.code), "CO2907", "CO2911"]);
  });

  // With nothing required, a complete search of 8 courses needs ~19.6M nodes
  // even with forward checking, so it stops at DEFAULT_MAX_NODES (5M) and
  // returns the best schedules found so far. Kept as a known limit rather than
  // raising the budget.
  const TRUNCATED = new Set(["app defaults", "every weight at 10, nothing required"]);

  it.each(CASES)("%s: under 3000 ms, conflict-free, truncated only where expected", (label, p) =>
    checkCase(`8 courses, ${label}`, COURSES_8, p, TRUNCATED.has(label)),
  );
});
