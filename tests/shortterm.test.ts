import { describe, expect, it } from "vitest";
import { defaultPrefs } from "../src/app/state";
import { parse, type Group } from "../src/lib/parser";
import { applyConstraints, equivalenceClasses, normalizePreferences, solve } from "../src/lib/solver";
import { buildMasks, conflicts, conflictSummary, type IndexedGroup } from "../src/lib/timing";
import { blocksForWeek, standardWeeks, toGridBlocks, weekLabel } from "../src/lib/view/grid";
import { formatCredits } from "../src/lib/view/format";
import { ALL_FIXTURES, readFixture } from "./fixtureText";

// SK2001 is a real short-term course: 64 single-session groups, each running
// only 5 weeks (1–5, 6–7 + 9–11, or 12–16), 0.0 credits, mostly full.

const PARSED = parse(readFixture("SK2001.txt"));
const [SK2001] = PARSED.courses;
const INDEXED = buildMasks([...PARSED.courses, ...parse(readFixture("CO2007.txt")).courses]).courses;
const byKey = (key: string): IndexedGroup => INDEXED.flatMap((c) => c.groups).find((g) => g.key === key)!;
const group = (id: string): Group => SK2001.groups.find((g) => g.id === id)!;

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * The test's own equivalence grouping, independent of the solver's code:
 * same day, periods, weeks, campus, language and full / not full.
 */
function ownClasses(groups: Group[]): Group[][] {
  const classes = new Map<string, Group[]>();
  for (const g of groups) {
    const s = g.sessions[0];
    const key = [s.day, s.periods.join(","), s.weeks.join(","), s.campus, g.language, g.registered >= g.capacity].join("|");
    classes.set(key, [...(classes.get(key) ?? []), g]);
  }
  return [...classes.values()];
}

/** A partition as sorted lists of ids, for comparing two groupings. */
const partition = (classes: { id: string }[][]) => classes.map((c) => c.map((g) => g.id).sort().join(" ")).sort();

describe("SK2001: parsing", () => {
  it("has 64 single-session theory groups A01–A04, CC01–CC60", () => {
    expect(PARSED.warnings).toEqual([]);
    const ids = SK2001.groups.map((g) => g.id);
    const expected = [...range(1, 4).map((n) => `A0${n}`), ...range(1, 60).map((n) => `CC${String(n).padStart(2, "0")}`)];
    expect(ids).toEqual(expected);
    for (const g of SK2001.groups) {
      expect(g.id.includes("_"), g.id).toBe(false);
      expect(g.practiceGroup).toBeNull();
      expect(g.sessions, g.id).toHaveLength(1);
      expect(g.sessions[0].kind, g.id).toBe("theory");
    }
  });

  it("keeps 0 credits as 0 (not null) and shows it as “0 TC”", () => {
    expect(SK2001.credits).toBe(0);
    expect(INDEXED[0].credits).toBe(0); // buildMasks keeps it too
    expect(formatCredits(SK2001.credits)).toBe("0 TC");
    expect(formatCredits(null)).toBe("? TC");
  });

  it("reads the three 5-week patterns", () => {
    expect(group("A01").sessions[0].weeks).toEqual([1, 2, 3, 4, 5]); // "12345-----…"
    expect(group("A03").sessions[0].weeks).toEqual([6, 7, 9, 10, 11]); // "-----67-901-…"
    expect(group("A04").sessions[0].weeks).toEqual([12, 13, 14, 15, 16]); // "-----------23456-…"
  });
});

describe("SK2001: equivalence classes", () => {
  it("groups into 42 classes, and the solver finds the same partition", () => {
    const own = ownClasses(SK2001.groups);
    expect(own).toHaveLength(42);
    const solverClasses = equivalenceClasses(INDEXED[0].groups, normalizePreferences(defaultPrefs()));
    expect(partition(solverClasses.map((c) => c.map((g) => g.group)))).toEqual(partition(own));
  });

  it("with free seats required: 15 groups remain, in 11 classes", () => {
    const prefs = normalizePreferences({ ...defaultPrefs(), freeSeats: { mode: "required" } });
    const open = SK2001.groups.filter((g) => g.registered < g.capacity);
    expect(open).toHaveLength(15);
    expect(ownClasses(open)).toHaveLength(11);
    const remaining = applyConstraints(INDEXED[0].groups, ["freeSeats"], prefs);
    expect(remaining.map((g) => g.group.id)).toEqual(open.map((g) => g.id));
    const solverClasses = equivalenceClasses(remaining, prefs);
    expect(partition(solverClasses.map((c) => c.map((g) => g.group)))).toEqual(partition(ownClasses(open)));
  });
});

describe("SK2001: conflicts across weeks", () => {
  it("CC21 (Mon 3–5, weeks 6–7, 9–11) and CC14 (Mon 3–5, weeks 1–5) do not conflict", () => {
    expect(conflicts(byKey("SK2001:CC21"), byKey("SK2001:CC14"))).toBe(false);
  });

  it("A04 (Thu 2–4, weeks 12–16) and CO2007:L04_L07 (Thu lab 2–6, weeks 7, 9, 11, 13) clash only in week 13", () => {
    const a04 = byKey("SK2001:A04");
    const lab = byKey("CO2007:L04_L07");
    expect(conflicts(a04, lab)).toBe(true);
    expect(conflictSummary(a04, lab)).toEqual([{ day: 5, periods: [2, 3, 4], weeks: [13] }]);
  });

  it("solves with every fixture, SK2001 included", () => {
    const all = buildMasks(ALL_FIXTURES.flatMap((name) => parse(readFixture(name)).courses)).courses;
    const result = solve(all, defaultPrefs());
    expect(result.status).toBe("ok");
    expect(result.schedules[0].picks.map((p) => p.courseCode)).toContain("SK2001");
  });
});

describe("SK2001: display", () => {
  const schedule = (keys: string[]) => ({
    picks: keys.map((key) => ({ courseCode: byKey(key).courseCode, group: byKey(key), alternatives: [] })),
    penalty: 0,
    score: 100,
    breakdown: [],
    violations: [],
  });

  it("labels 5-week sessions in the all-weeks view, and not the usual-term ones", () => {
    const standard = standardWeeks([SK2001, ...parse(readFixture("CO2007.txt")).courses]);
    expect(standard).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16]);
    const blocks = toGridBlocks(schedule(["SK2001:A04", "SK2001:A03", "CO2007:L04_L08"]));
    const labels = blocks.map((b) => `${b.courseCode} ${b.groupId} ${b.kind}: ${weekLabel(b, standard)}`);
    expect(labels).toEqual([
      "CO2007 L04_L08 lab: tuần 7,9,11,13",
      "SK2001 A04 theory: T12–16", // Thu 2–4
      "CO2007 L04_L08 theory: null", // Thu 8–10, usual term
      "SK2001 A03 theory: T6–7, 9–11", // Thu 10–12
    ]);
  });

  it("week view: A01 (weeks 1–5) shows in week 3 only, A04 (weeks 12–16) in week 13 only", () => {
    const blocks = toGridBlocks(schedule(["SK2001:A01", "SK2001:A04"]));
    expect(blocksForWeek(blocks, 3).map((b) => b.groupId)).toEqual(["A01"]);
    expect(blocksForWeek(blocks, 13).map((b) => b.groupId)).toEqual(["A04"]);
    expect(blocksForWeek(blocks, 8)).toEqual([]);
  });
});
