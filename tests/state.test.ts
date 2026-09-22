import { describe, expect, it } from "vitest";
import { mergePastes, parsePaste, splitByCourse } from "../src/app/pastes";
import { markFull, undoAutoLocks } from "../src/app/selection";
import { canGoTo, defaultPrefs, initialState, isResultStale, reducer, responseAction, selectionsOf, type Action, type AppState } from "../src/app/state";
import { loadSaved, STORAGE_KEY } from "../src/app/storage";
import { parse } from "../src/lib/parser";
import { DEFAULT_PREFERENCES } from "../src/lib/solver";
import { handleRequest } from "../src/lib/solver/protocol";
import { checklistText, scheduleCredits } from "../src/lib/view/checklist";
import { readFixture } from "./fixtureText";

const CO2007 = readFixture("CO2007.txt");
const CO2011 = readFixture("CO2011.txt");

function apply(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce(reducer, state);
}

const addPaste = (raw: string): Action => ({ type: "addPaste", raw });
const lock = (courseCode: string, groupId: string): Action => ({ type: "lock", courseCode, groupId });
const unlock = (courseCode: string): Action => ({ type: "unlock", courseCode });
const exclude = (key: string): Action => ({ type: "exclude", key });
const unexclude = (key: string): Action => ({ type: "unexclude", key });
const markFullAction = (key: string): Action => ({ type: "markFullAndRerun", key });
const idOf = (key: string) => key.slice(key.indexOf(":") + 1);

/** Both fixtures pasted, results shown (request id 1). */
function withResults(): AppState {
  return run(apply(initialState(), addPaste(CO2007), addPaste(CO2011)), 1);
}

/** Keys of the picks of the schedule at `index`, in course order (CO2007, CO2011). */
function pickKeys(state: AppState, index = 0): string[] {
  return state.result!.result.schedules[index].picks.map((p) => p.group.key);
}

/**
 * Derived: the registration text of `raw` with one group's block removed (the
 * group header line and its session lines), as if it disappeared on re-paste.
 */
function withoutGroup(raw: string, groupId: string): string {
  const lines = raw.split(/\r?\n/);
  const isGroupLine = (line: string) => /^[A-Z]+\d+(?:_[A-Z]+\d+)?\t\d+\/\d+\t/.test(line);
  const start = lines.findIndex((line) => line.startsWith(`${groupId}\t`));
  let end = start + 1;
  while (end < lines.length && !isGroupLine(lines[end])) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

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

  it("leaves locked and excluded groups to their own actions (setPrefs / resetPrefs keep them)", () => {
    const locked = apply(initialState(), addPaste(CO2007), addPaste(CO2011), lock("CO2007", "A01_A01"), exclude("CO2011:A01"));
    const prefs = { ...structuredClone(DEFAULT_PREFERENCES), locked: {}, excluded: [] };
    for (const state of [apply(locked, { type: "setPrefs", prefs }), apply(locked, { type: "resetPrefs" })]) {
      expect(state.prefs.locked).toEqual({ CO2007: "A01_A01" });
      expect(state.prefs.excluded).toEqual(["CO2011:A01"]);
    }
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

// ---------------------------------------------------------------------------
// Locking and excluding groups (Phase 5)
// ---------------------------------------------------------------------------

describe("lock / unlock", () => {
  it("locks one group per course and unlocks it", () => {
    const base = apply(initialState(), addPaste(CO2007), addPaste(CO2011));
    const locked = apply(base, lock("CO2007", "A01_A01"), lock("CO2011", "L01"));
    expect(locked.prefs.locked).toEqual({ CO2007: "A01_A01", CO2011: "L01" });
    expect(locked.version).toBe(base.version + 2);

    const replaced = apply(locked, lock("CO2007", "L04_L08"));
    expect(replaced.prefs.locked).toEqual({ CO2007: "L04_L08", CO2011: "L01" });
    expect(apply(replaced, lock("CO2007", "L04_L08"))).toBe(replaced); // no change -> same state

    const unlocked = apply(replaced, unlock("CO2007"));
    expect(unlocked.prefs.locked).toEqual({ CO2011: "L01" });
    expect(apply(unlocked, unlock("CO2007"))).toBe(unlocked);
  });

  it("ignores a lock on a group that is not pasted", () => {
    const base = apply(initialState(), addPaste(CO2007));
    expect(apply(base, lock("CO2011", "L01"))).toBe(base);
    expect(apply(base, lock("CO2007", "L01"))).toBe(base); // CO2007 has L01_L01, not L01
  });

  it("re-runs automatically only on step 4; elsewhere the result just goes stale", () => {
    const done = withResults();
    expect(done.step).toBe(4);
    const onResults = apply(done, lock("CO2011", "L03"));
    expect(onResults.autoRun).toBe(true);
    expect(isResultStale(onResults)).toBe(true);

    const onPrefs = apply(done, { type: "goTo", step: 3 }, lock("CO2011", "L03"));
    expect(onPrefs.autoRun).toBe(false);
    expect(isResultStale(onPrefs)).toBe(true);

    // A queued re-run is dropped when leaving step 4, cleared by the run itself, or cancelled.
    expect(apply(onResults, { type: "goTo", step: 3 }).autoRun).toBe(false);
    expect(apply(onResults, { type: "solveStart", id: 2 }).autoRun).toBe(false);
    expect(apply(onResults, { type: "cancelAutoRun" }).autoRun).toBe(false);
  });

  it("goes back to the first schedule after a re-run, and every schedule keeps the lock", () => {
    const done = apply(withResults(), { type: "selectSchedule", index: 2 });
    expect(done.selected).toBe(2);
    const co2011 = pickKeys(done, 2)[1];
    const rerun = run(apply(done, lock("CO2011", idOf(co2011))), 2);
    expect(rerun.selected).toBe(0);
    expect(rerun.result!.result.schedules.length).toBeGreaterThan(0);
    for (const schedule of rerun.result!.result.schedules) {
      expect(schedule.picks.map((p) => p.group.key)).toContain(co2011);
    }
  });

  it("clamps the selected schedule", () => {
    const done = withResults();
    expect(apply(done, { type: "selectSchedule", index: 99 }).selected).toBe(4);
    expect(apply(done, { type: "selectSchedule", index: -3 }).selected).toBe(0);
  });
});

describe("exclude / un-exclude", () => {
  it("adds and removes excluded keys, once each", () => {
    const base = apply(initialState(), addPaste(CO2007), addPaste(CO2011));
    const excluded = apply(base, exclude("CO2007:CC02_CC03"), exclude("CO2011:CC05"), exclude("CO2007:CC02_CC03"));
    expect(excluded.prefs.excluded).toEqual(["CO2007:CC02_CC03", "CO2011:CC05"]);
    const back = apply(excluded, unexclude("CO2007:CC02_CC03"));
    expect(back.prefs.excluded).toEqual(["CO2011:CC05"]);
    expect(apply(back, unexclude("CO2007:CC02_CC03"))).toBe(back);
  });

  it("never keeps a group both locked and excluded", () => {
    const base = apply(initialState(), addPaste(CO2007), lock("CO2007", "A01_A01"));
    const excluded = apply(base, exclude("CO2007:A01_A01"));
    expect(excluded.prefs).toMatchObject({ locked: {}, excluded: ["CO2007:A01_A01"] });
    const relocked = apply(excluded, lock("CO2007", "A01_A01"));
    expect(relocked.prefs).toMatchObject({ locked: { CO2007: "A01_A01" }, excluded: [] });
  });

  it("clears everything with Bỏ tất cả", () => {
    const state = apply(initialState(), addPaste(CO2007), addPaste(CO2011), lock("CO2007", "A01_A01"), exclude("CO2011:L01"));
    const cleared = apply(state, { type: "clearSelections" });
    expect(cleared.prefs).toMatchObject({ locked: {}, excluded: [] });
    expect(cleared.autoLocked).toEqual([]);
  });
});

describe("markFullAndRerun", () => {
  it("excludes the key and auto-locks every other pick of the SELECTED schedule", () => {
    const done = apply(withResults(), { type: "selectSchedule", index: 1 });
    const [co2007, co2011] = pickKeys(done, 1);
    const marked = apply(done, markFullAction(co2007));
    expect(marked.prefs.excluded).toEqual([co2007]);
    expect(marked.prefs.locked).toEqual({ CO2011: idOf(co2011) });
    expect(marked.autoLocked).toEqual([co2011]);
    expect(marked.autoRun).toBe(true);

    // The re-run: tab 1, the full group is gone, the other course is unchanged.
    const rerun = run(marked, 2);
    expect(rerun.selected).toBe(0);
    for (const schedule of rerun.result!.result.schedules) {
      const keys = schedule.picks.map((p) => p.group.key);
      expect(keys).not.toContain(co2007);
      expect(keys).toContain(co2011);
    }
  });

  it("keeps a user lock as a user lock, and unlocks the full group if it was locked", () => {
    const done = withResults();
    const [co2007, co2011] = pickKeys(done);
    const userLocked = apply(done, lock("CO2011", idOf(co2011)), lock("CO2007", idOf(co2007)));
    const marked = apply(userLocked, markFullAction(co2007));
    expect(marked.prefs.locked).toEqual({ CO2011: idOf(co2011) });
    expect(marked.prefs.excluded).toEqual([co2007]);
    expect(marked.autoLocked).toEqual([]);
  });

  it("undoing auto locks keeps user locks and excluded groups", () => {
    const done = withResults();
    const [co2007] = pickKeys(done);
    // "Đã đầy" on CO2007 auto-locks CO2011; then the user locks a CO2007 group.
    const state = apply(done, markFullAction(co2007), lock("CO2007", "L03_L06"));
    expect(Object.keys(state.prefs.locked).sort()).toEqual(["CO2007", "CO2011"]);
    expect(state.autoLocked).toHaveLength(1);

    const undone = apply(state, { type: "undoAutoLocks" });
    expect(undone.prefs.locked).toEqual({ CO2007: "L03_L06" });
    expect(undone.prefs.excluded).toEqual([co2007]);
    expect(undone.autoLocked).toEqual([]);
  });

  it("keeps marking full until no group fits, then retrying without the auto locks finds one", () => {
    // Real data: with CO2011 kept on its group, CO2007 runs out of groups that fit around it.
    let state = withResults();
    let id = 1;
    const kept = pickKeys(state)[1];
    while (state.result!.result.status !== "infeasible") {
      state = run(apply(state, markFullAction(pickKeys(state)[0])), ++id);
      expect(id).toBeLessThan(30);
    }
    expect(state.prefs.locked).toEqual({ CO2011: idOf(kept) });
    expect(state.autoLocked).toEqual([kept]);
    const excluded = state.prefs.excluded;
    expect(excluded.every((key) => key.startsWith("CO2007:"))).toBe(true);

    const retried = run(apply(state, { type: "undoAutoLocks" }), ++id);
    expect(retried.prefs.locked).toEqual({});
    expect(retried.prefs.excluded).toEqual(excluded);
    expect(retried.result!.result.status).toBe("ok");
    const [co2007, co2011] = pickKeys(retried);
    expect(excluded).not.toContain(co2007);
    expect(co2011).not.toBe(kept); // every CO2007 group left clashes with the kept group
  });

  it("markFull / undoAutoLocks as pure functions", () => {
    const picks = [
      { courseCode: "CO2007", groupId: "A01_A01" },
      { courseCode: "CO2011", groupId: "L02" },
    ];
    const userLock = markFull({ locked: { CO2007: "A01_A01" }, excluded: [], autoLocked: [], registered: [] }, "CO2011:L02", picks);
    expect(userLock).toEqual({ locked: { CO2007: "A01_A01" }, excluded: ["CO2011:L02"], autoLocked: [], registered: [] });
    const auto = markFull({ locked: {}, excluded: [], autoLocked: [], registered: [] }, "CO2011:L02", picks);
    expect(auto).toEqual({ locked: { CO2007: "A01_A01" }, excluded: ["CO2011:L02"], autoLocked: ["CO2007:A01_A01"], registered: [] });
    expect(undoAutoLocks(auto)).toEqual({ locked: {}, excluded: ["CO2011:L02"], autoLocked: [], registered: [] });
    // A pick that is itself excluded (stale result) is not locked.
    const stale = markFull({ locked: {}, excluded: ["CO2007:A01_A01"], autoLocked: [], registered: [] }, "CO2011:L02", picks);
    expect(stale).toEqual({ locked: {}, excluded: ["CO2007:A01_A01", "CO2011:L02"], autoLocked: [], registered: [] });
  });
});

describe("pruning stale locks and excluded groups", () => {
  const selections = (state: AppState) => selectionsOf(state);

  it("drops a removed course's entries", () => {
    const done = withResults();
    const [co2007, co2011] = pickKeys(done);
    let state = apply(done, markFullAction(co2007), exclude("CO2011:CC05"), lock("CO2007", "A01_A01"));
    expect(selections(state)).toEqual({
      locked: { CO2011: idOf(co2011), CO2007: "A01_A01" },
      excluded: [co2007, "CO2011:CC05"],
      autoLocked: [co2011],
      registered: [],
    });
    state = apply(state, { type: "removeCourse", code: "CO2011" });
    expect(selections(state)).toEqual({ locked: { CO2007: "A01_A01" }, excluded: [co2007], autoLocked: [], registered: [] });
  });

  it("drops entries for a group that is gone after a re-paste, and keeps the rest", () => {
    const repasted = withoutGroup(CO2007, "A01_A02");
    const groups = parse(repasted).courses[0].groups.map((g) => g.id);
    expect(groups).toHaveLength(17);
    expect(groups).not.toContain("A01_A02");

    const before = apply(initialState(), addPaste(CO2007), addPaste(CO2011), lock("CO2007", "A01_A02"), exclude("CO2007:A01_A01"), exclude("CO2007:L01_L01"));
    expect(before.prefs.locked).toEqual({ CO2007: "A01_A02" });
    const after = apply(before, addPaste(repasted));
    expect(after.notice).toEqual({ added: [], replaced: ["CO2007"], empty: false });
    expect(selections(after)).toEqual({ locked: {}, excluded: ["CO2007:A01_A01", "CO2007:L01_L01"], autoLocked: [], registered: [] });
  });

  it("prunes what was saved when loading", () => {
    const pastes = splitByCourse(`${CO2007}\n${CO2011}`);
    const prefs = { ...defaultPrefs(), locked: { CO2007: "A01_A01", CO2011: "A01_A01", MT1003: "L01" }, excluded: ["CO2011:L01", "CO2011:L01", "CO2007:L01", "junk"] };
    const autoLocked = ["CO2007:A01_A01", "CO2011:A01_A01", "CO2011:L02"];
    const data = new Map([[STORAGE_KEY, JSON.stringify({ pastes, prefs, autoLocked })]]);
    const loaded = loadSaved({ getItem: (key) => data.get(key) ?? null, setItem: () => {} });
    expect(loaded.prefs.locked).toEqual({ CO2007: "A01_A01" });
    expect(loaded.prefs.excluded).toEqual(["CO2011:L01"]);
    expect(loaded.autoLocked).toEqual(["CO2007:A01_A01"]);
    expect(initialState(loaded)).toMatchObject({ autoLocked: ["CO2007:A01_A01"], selected: 0, autoRun: false });
  });
});

// ---------------------------------------------------------------------------
// Step 5: registration checklist
// ---------------------------------------------------------------------------

describe("checklist (step 5)", () => {
  const register = (key: string): Action => ({ type: "register", key });
  const unregister = (key: string): Action => ({ type: "unregister", key });
  const toChecklist = (state: AppState) => apply(state, { type: "goTo", step: 5 });

  it("opens once a schedule exists", () => {
    const pasted = apply(initialState(), addPaste(CO2007), addPaste(CO2011));
    expect(canGoTo(pasted, 5)).toBe(false);
    expect(apply(pasted, { type: "goTo", step: 5 }).step).toBe(1); // stays where it was
    const done = withResults();
    expect(canGoTo(done, 5)).toBe(true);
    expect(toChecklist(done).step).toBe(5);
  });

  it("checking a row is a user lock; unchecking removes it; neither re-runs", () => {
    const state = toChecklist(withResults());
    const [co2007, co2011] = pickKeys(state);
    const checked = apply(state, register(co2007));
    expect(checked.registered).toEqual([co2007]);
    expect(checked.prefs.locked).toEqual({ CO2007: idOf(co2007) });
    expect(checked.autoLocked).toEqual([]);
    expect(checked.autoRun).toBe(false);
    expect(apply(checked, register(co2007))).toBe(checked);

    const both = apply(checked, register(co2011));
    expect(both.registered).toEqual([co2007, co2011]);
    const unchecked = apply(both, unregister(co2007));
    expect(unchecked.registered).toEqual([co2011]);
    expect(unchecked.prefs.locked).toEqual({ CO2011: idOf(co2011) });
    expect(unchecked.autoRun).toBe(false);
  });

  it("turns an automatic lock into a user lock, so undoing auto locks keeps it", () => {
    const state = toChecklist(withResults());
    const [co2007, co2011] = pickKeys(state);
    const marked = apply(state, markFullAction(co2007)); // auto-locks co2011
    expect(marked.autoLocked).toEqual([co2011]);
    const registered = apply(marked, register(co2011));
    expect(registered.autoLocked).toEqual([]);
    expect(apply(registered, { type: "undoAutoLocks" }).prefs.locked).toEqual({ CO2011: idOf(co2011) });
  });

  it("drops the mark when its lock goes (unlock elsewhere, a different lock, or “Đã đầy” on it)", () => {
    const state = toChecklist(withResults());
    const [co2007] = pickKeys(state);
    const checked = apply(state, register(co2007));
    expect(apply(checked, unlock("CO2007")).registered).toEqual([]);
    expect(apply(checked, lock("CO2007", "A01_A01")).registered).toEqual([]);
    const full = apply(checked, markFullAction(co2007));
    expect(full.registered).toEqual([]);
    expect(full.prefs.excluded).toEqual([co2007]);
  });

  it("“Đã đầy” from step 5 re-runs and stays on step 5, keeping the other row", () => {
    const state = toChecklist(withResults());
    const [co2007, co2011] = pickKeys(state);
    const marked = apply(state, register(co2011), markFullAction(co2007));
    expect(marked.autoRun).toBe(true);
    const rerun = run(marked, 2);
    expect(rerun.step).toBe(5);
    const [newCo2007, sameCo2011] = pickKeys(rerun);
    expect(newCo2007).not.toBe(co2007);
    expect(sameCo2011).toBe(co2011);
    expect(rerun.registered).toEqual([co2011]);
  });

  it("prunes marks like locks: removed course, and load from storage", () => {
    const state = toChecklist(withResults());
    const [co2007, co2011] = pickKeys(state);
    const checked = apply(state, register(co2007), register(co2011));
    expect(apply(checked, { type: "removeCourse", code: "CO2011" }).registered).toEqual([co2007]);

    const pastes = splitByCourse(CO2007);
    const prefs = { ...defaultPrefs(), locked: { CO2007: idOf(co2007) } };
    const data = new Map([[STORAGE_KEY, JSON.stringify({ pastes, prefs, registered: [co2007, co2011, "CO2007:A01_A01"] })]]);
    const loaded = loadSaved({ getItem: (key) => data.get(key) ?? null, setItem: () => {} });
    expect(loaded.registered).toEqual([co2007]); // CO2011 not pasted; A01_A01 not the locked group
  });

  it("copies every row as “CODE  GROUP” lines and adds up credits (0 counts, unknown is listed)", () => {
    const schedule = withResults().result!.result.schedules[0];
    const [co2007, co2011] = schedule.picks.map((p) => p.group.group.id);
    expect(checklistText(schedule)).toBe(`CO2007  ${co2007}\nCO2011  ${co2011}`);
    expect(scheduleCredits(schedule, { CO2007: 4, CO2011: 3 })).toEqual({ total: 7, unknown: [] });
    expect(scheduleCredits(schedule, { CO2007: 0, CO2011: null })).toEqual({ total: 0, unknown: ["CO2011"] });
  });

  it("remembers the semester start", () => {
    const state = apply(initialState(), { type: "setSemesterStart", date: "2026-09-07" });
    expect(state.semesterStart).toBe("2026-09-07");
    expect(apply(state, { type: "setSemesterStart", date: "2026-09-07" })).toBe(state);
    expect(apply(state, { type: "setSemesterStart", date: null }).semesterStart).toBeNull();
  });
});
