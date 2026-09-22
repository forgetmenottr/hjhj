import { describe, expect, it } from "vitest";
import { mergePastes, parsePaste, splitByCourse } from "../src/app/pastes";
import { canGoTo, initialState, isResultStale, reducer, responseAction, type Action, type AppState } from "../src/app/state";
import { parse } from "../src/lib/parser";
import { DEFAULT_PREFERENCES } from "../src/lib/solver";
import { handleRequest } from "../src/lib/solver/protocol";
import { readFixture } from "./fixtureText";

const CO2007 = readFixture("CO2007.txt");
const CO2011 = readFixture("CO2011.txt");

function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state);
}

const addPaste = (raw: string): Action => ({ type: "addPaste", raw });

/** A real solver response for the current pastes, as the worker would send it. */
function solved(state: AppState, id: number): Action {
  const courses = state.pastes.flatMap((p) => parsePaste(p).course ?? []);
  return responseAction(handleRequest({ id, courses, prefs: state.prefs }), 12);
}

/** Starts and finishes a solver run with request `id`. */
function run(state: AppState, id: number): AppState {
  const started = reducer(state, { type: "solveStart", id });
  return reducer(started, solved(started, id));
}

// ---------------------------------------------------------------------------
// Splitting a paste into courses
// ---------------------------------------------------------------------------

describe("splitByCourse", () => {
  it("keeps a single fixture as one course block", () => {
    const [block, ...rest] = splitByCourse(CO2007);
    expect(rest).toEqual([]);
    expect(block.code).toBe("CO2007");
    const parsed = parse(block.raw);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.courses).toEqual(parse(CO2007).courses);
  });

  it("splits two courses pasted back-to-back, each with its own summary lines", () => {
    for (const joiner of ["\n", "\r\n\r\n\r\n"]) {
      const blocks = splitByCourse(CO2007 + joiner + CO2011);
      expect(blocks.map((b) => b.code)).toEqual(["CO2007", "CO2011"]);
      expect(blocks[1].raw.startsWith("STT")).toBe(true);
      expect(parse(blocks[0].raw)).toEqual(parse(CO2007));
      expect(parse(blocks[1].raw)).toEqual(parse(CO2011));
    }
  });

  it("finds nothing in text without a course header", () => {
    expect(splitByCourse("")).toEqual([]);
    expect(splitByCourse(CO2007.split(/\r?\n/).slice(0, 2).join("\n"))).toEqual([]); // summary lines only
  });

  it("merges: same code replaced in place, new code appended", () => {
    const first = mergePastes([], splitByCourse(`${CO2007}\n${CO2011}`));
    expect(first).toMatchObject({ added: ["CO2007", "CO2011"], replaced: [] });
    const again = mergePastes(first.pastes, [{ code: "CO2007", raw: "new" }]);
    expect(again.pastes.map((p) => [p.code, p.raw === "new"])).toEqual([["CO2007", true], ["CO2011", false]]);
    expect(again).toMatchObject({ added: [], replaced: ["CO2007"] });
  });
});

// ---------------------------------------------------------------------------
// Reducer: pastes
// ---------------------------------------------------------------------------

describe("reducer: adding and removing courses", () => {
  it("adds pastes in order with a notice", () => {
    const one = apply(initialState(), addPaste(CO2007));
    expect(one.pastes.map((p) => p.code)).toEqual(["CO2007"]);
    expect(one.notice).toEqual({ added: ["CO2007"], replaced: [], empty: false });

    const two = apply(one, addPaste(CO2011));
    expect(two.pastes.map((p) => p.code)).toEqual(["CO2007", "CO2011"]);
    expect(two.notice).toEqual({ added: ["CO2011"], replaced: [], empty: false });
  });

  it("replaces a re-pasted course in place", () => {
    // Derived from the fixture: A01_A01 filled up since the first paste.
    const repasted = CO2007.replace("A01_A01\t34/40", "A01_A01\t40/40");
    const state = apply(initialState(), addPaste(CO2007), addPaste(CO2011), addPaste(repasted));
    expect(state.pastes.map((p) => p.code)).toEqual(["CO2007", "CO2011"]);
    expect(parsePaste(state.pastes[0]).course?.groups[0].registered).toBe(40);
    expect(state.notice).toEqual({ added: [], replaced: ["CO2007"], empty: false });
  });

  it("reports a paste with no course and changes nothing else", () => {
    const before = apply(initialState(), addPaste(CO2007));
    const after = apply(before, addPaste("nội dung không liên quan"));
    expect(after.pastes).toBe(before.pastes);
    expect(after.version).toBe(before.version);
    expect(after.notice).toEqual({ added: [], replaced: [], empty: true });
  });

  it("removes a course, and returns to step 1 when none is left", () => {
    let state = apply(initialState(), addPaste(CO2007), addPaste(CO2011), { type: "goTo", step: 3 });
    state = apply(state, { type: "removeCourse", code: "CO2007" });
    expect(state.pastes.map((p) => p.code)).toEqual(["CO2011"]);
    expect(state.step).toBe(3);
    state = apply(state, { type: "removeCourse", code: "CO2011" });
    expect(state.pastes).toEqual([]);
    expect(state.step).toBe(1);
  });

  it("defaults to preferring groups with free seats", () => {
    const state = initialState();
    expect(state.prefs.freeSeats.mode).toBe("preferred");
    expect(apply(state, { type: "resetPrefs" }).prefs.freeSeats.mode).toBe("preferred");
  });

  it("keeps locked and excluded empty (Phase 5 features)", () => {
    const prefs = { ...structuredClone(DEFAULT_PREFERENCES), locked: { CO2007: "A01_A01" }, excluded: ["CO2011:A01"] };
    const state = apply(initialState(), { type: "setPrefs", prefs });
    expect(state.prefs.locked).toEqual({});
    expect(state.prefs.excluded).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Stale flag and solver responses
// ---------------------------------------------------------------------------

describe("stale result", () => {
  const withCourses = () => apply(initialState(), addPaste(CO2007), addPaste(CO2011));

  it("is fresh right after a run and stale after courses or prefs change", () => {
    const done = run(withCourses(), 1);
    expect(done.solverStatus).toBe("done");
    expect(done.result?.result.schedules.length).toBe(5);
    expect(isResultStale(done)).toBe(false);

    expect(isResultStale(apply(done, { type: "removeCourse", code: "CO2011" }))).toBe(true);
    expect(isResultStale(apply(done, addPaste(CO2011)))).toBe(true); // re-paste replaces → changed
    const prefs = { ...done.prefs, freeSeats: { mode: "required" as const } };
    const changed = apply(done, { type: "setPrefs", prefs });
    expect(isResultStale(changed)).toBe(true);
    expect(isResultStale(run(changed, 2))).toBe(false);
  });

  it("marks a result stale when inputs changed while it was running", () => {
    const started = apply(withCourses(), { type: "solveStart", id: 1 });
    const edited = apply(started, { type: "resetPrefs" });
    const done = apply(edited, solved(started, 1));
    expect(done.solverStatus).toBe("done");
    expect(isResultStale(done)).toBe(true);
  });

  it("ignores responses for an older request", () => {
    const first = apply(withCourses(), { type: "solveStart", id: 1 });
    const second = apply(first, { type: "solveStart", id: 2 });
    const late = apply(second, solved(first, 1));
    expect(late).toBe(second);
    expect(apply(second, { type: "solveFailed", id: 1, error: "x" })).toBe(second);
    expect(apply(second, { type: "solveCancelled", id: 1 })).toBe(second);
  });

  it("handles errors and cancellation, keeping the previous result", () => {
    const done = run(withCourses(), 1);
    const failed = apply(done, { type: "solveStart", id: 2 }, { type: "solveFailed", id: 2, error: "Quá 15 giây" });
    expect(failed).toMatchObject({ solverStatus: "error", error: "Quá 15 giây", request: null });
    expect(failed.result).toBe(done.result);

    const cancelled = apply(done, { type: "solveStart", id: 3 }, { type: "solveCancelled", id: 3 });
    expect(cancelled).toMatchObject({ solverStatus: "idle", request: null });
    expect(cancelled.result).toBe(done.result);
  });
});

// ---------------------------------------------------------------------------
// Step validation
// ---------------------------------------------------------------------------

describe("step validation", () => {
  it("blocks steps 2-4 until there is a course with a group", () => {
    const empty = initialState();
    expect([1, 2, 3, 4].map((s) => canGoTo(empty, s as 1))).toEqual([true, false, false, false]);
    expect(apply(empty, { type: "goTo", step: 2 }).step).toBe(1);
  });

  it("does not count a course without groups", () => {
    // Derived: only the summary lines and the course header of CO2011.
    const headerOnly = CO2011.split(/\r?\n/).slice(0, 3).join("\n");
    const state = apply(initialState(), addPaste(headerOnly));
    expect(state.pastes.map((p) => p.code)).toEqual(["CO2011"]);
    expect(canGoTo(state, 2)).toBe(false);
  });

  it("opens steps 2-3 with a course, and step 4 once a run has started", () => {
    const state = apply(initialState(), addPaste(CO2007));
    expect([2, 3, 4].map((s) => canGoTo(state, s as 2))).toEqual([true, true, false]);
    expect(apply(state, { type: "goTo", step: 3 }).step).toBe(3);
    const running = apply(state, { type: "solveStart", id: 1 });
    expect(running.step).toBe(4);
    expect(canGoTo(running, 4)).toBe(true);
  });

  it("always allows going back", () => {
    const state = apply(initialState(), addPaste(CO2007), { type: "goTo", step: 3 });
    expect(apply(state, { type: "goTo", step: 1 }).step).toBe(1);
  });
});
