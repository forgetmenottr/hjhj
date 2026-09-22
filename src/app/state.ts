import { DEFAULT_PREFERENCES, type Preferences, type SolveResult } from "../lib/solver";
import type { SolveResponse } from "../lib/solver/protocol";
import type { TimeWarning } from "../lib/timing";
import { mergePastes, schedulableCourses, splitByCourse, type Paste } from "./pastes";
import {
  excludeGroup,
  groupIdsByCourse,
  lockGroup,
  markFull,
  pruneSelections,
  sameSelections,
  undoAutoLocks,
  unexcludeGroup,
  unlockCourse,
  type Selections,
} from "./selection";

/** Lock / exclude changes made on step 4 re-run the solver after this pause, so quick clicks share one run. */
export const AUTO_RERUN_DELAY_MS = 200;

export type Step = 1 | 2 | 3 | 4;
export type SolverStatus = "idle" | "running" | "done" | "error";

/** What one solver run produced. */
export interface SolveOutcome {
  result: SolveResult;
  maskWarnings: TimeWarning[];
  /** Round trip main thread → worker → main thread, in ms. */
  elapsedMs: number;
}

/** Feedback for the last "Thêm môn". */
export interface PasteNotice {
  added: string[];
  replaced: string[];
  /** True when the text contained no course at all. */
  empty: boolean;
}

export interface AppState {
  pastes: Paste[];
  prefs: Preferences;
  step: Step;
  solverStatus: SolverStatus;
  /** Last result, tagged with its request id and the input version it was computed from. */
  result: (SolveOutcome & { id: number; version: number }) | null;
  error: string | null;
  notice: PasteNotice | null;
  /** Incremented whenever pastes or prefs change. */
  version: number;
  /** The request in flight; responses with another id are stale and ignored. */
  request: { id: number; version: number } | null;
  /** Keys of locks the app added itself (see selection.ts); saved with the prefs. */
  autoLocked: string[];
  /** Index of the schedule shown in step 4; back to 0 after every run. */
  selected: number;
  /** A lock/exclude change on step 4 is waiting for its automatic re-run. */
  autoRun: boolean;
}

export type Action =
  | { type: "addPaste"; raw: string }
  | { type: "removeCourse"; code: string }
  | { type: "setPrefs"; prefs: Preferences }
  | { type: "resetPrefs" }
  | { type: "goTo"; step: Step }
  | { type: "solveStart"; id: number }
  | { type: "solveDone"; id: number; outcome: SolveOutcome }
  | { type: "solveFailed"; id: number; error: string }
  | { type: "solveCancelled"; id: number }
  | { type: "selectSchedule"; index: number }
  | { type: "lock"; courseCode: string; groupId: string }
  | { type: "unlock"; courseCode: string }
  | { type: "exclude"; key: string }
  | { type: "unexclude"; key: string }
  | { type: "clearSelections" }
  | { type: "markFullAndRerun"; key: string }
  | { type: "undoAutoLocks" }
  | { type: "cancelAutoRun" };

/**
 * App defaults: the solver's defaults, plus "Còn chỗ trống" as a preference so
 * the first suggestions avoid groups that are already full.
 */
export function defaultPrefs(): Preferences {
  const prefs = structuredClone(DEFAULT_PREFERENCES);
  prefs.freeSeats.mode = "preferred";
  return prefs;
}

export function initialState(saved?: { pastes: Paste[]; prefs: Preferences; autoLocked?: string[] }): AppState {
  return {
    pastes: saved?.pastes ?? [],
    prefs: saved?.prefs ?? defaultPrefs(),
    autoLocked: saved?.autoLocked ?? [],
    selected: 0,
    autoRun: false,
    step: 1,
    solverStatus: "idle",
    result: null,
    error: null,
    notice: null,
    version: 0,
    request: null,
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** At least one course with at least one group. */
export function hasSchedulableCourse(pastes: Paste[]): boolean {
  return schedulableCourses(pastes).length > 0;
}

/** Going back is always allowed; forward needs a usable course (and, for step 4, something to show). */
export function canGoTo(state: AppState, step: Step, hasCourses = hasSchedulableCourse(state.pastes)): boolean {
  if (step === 1) return true;
  if (!hasCourses) return false;
  if (step === 4) return state.result !== null || state.solverStatus !== "idle";
  return true;
}

/** Courses or preferences changed after the shown result was computed. */
export function isResultStale(state: AppState): boolean {
  return state.result !== null && state.result.version !== state.version;
}

export function selectionsOf(state: Pick<AppState, "prefs" | "autoLocked">): Selections {
  return { locked: state.prefs.locked, excluded: state.prefs.excluded, autoLocked: state.autoLocked };
}

/** Maps a worker response to the matching action. */
export function responseAction(response: SolveResponse, elapsedMs: number): Action {
  return response.ok
    ? { type: "solveDone", id: response.id, outcome: { result: response.result, maskWarnings: response.maskWarnings, elapsedMs } }
    : { type: "solveFailed", id: response.id, error: response.error };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

/** Input changed: bump the version so the current result becomes stale. */
function changed(state: AppState, patch: Partial<AppState>): AppState {
  return { ...state, ...patch, version: state.version + 1 };
}

function selectionPatch(state: AppState, s: Selections): Pick<AppState, "prefs" | "autoLocked"> {
  return { prefs: { ...state.prefs, locked: s.locked, excluded: s.excluded }, autoLocked: s.autoLocked };
}

/** Pastes changed: drop locks and excluded keys whose course or group is gone. */
function withPastes(state: AppState, pastes: Paste[], patch: Partial<AppState>): AppState {
  const pruned = pruneSelections(selectionsOf(state), groupIdsByCourse(pastes));
  return changed(state, { ...patch, pastes, ...selectionPatch(state, pruned) });
}

/**
 * Applies a lock / exclude change (pruned, so a stale result cannot lock a
 * course that was removed). On step 4 it queues an automatic re-run;
 * elsewhere the result just becomes stale. No change → same state.
 */
function withSelections(state: AppState, change: Selections): AppState {
  const next = pruneSelections(change, groupIdsByCourse(state.pastes));
  if (sameSelections(next, selectionsOf(state))) return state;
  return changed(state, { ...selectionPatch(state, next), autoRun: state.step === 4 });
}

/** True if the action answers the request currently in flight. */
function isCurrent(state: AppState, id: number): boolean {
  return state.request !== null && state.request.id === id;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "addPaste": {
      const incoming = splitByCourse(action.raw);
      if (incoming.length === 0) return { ...state, notice: { added: [], replaced: [], empty: true } };
      const { pastes, added, replaced } = mergePastes(state.pastes, incoming);
      return withPastes(state, pastes, { notice: { added, replaced, empty: false } });
    }
    case "removeCourse": {
      const pastes = state.pastes.filter((p) => p.code !== action.code);
      const step = hasSchedulableCourse(pastes) ? state.step : 1;
      return withPastes(state, pastes, { step, notice: null });
    }
    // Locked / excluded groups have their own actions; the preferences form never changes them.
    case "setPrefs":
      return changed(state, { prefs: { ...action.prefs, locked: state.prefs.locked, excluded: state.prefs.excluded } });
    case "resetPrefs":
      return changed(state, { prefs: { ...defaultPrefs(), locked: state.prefs.locked, excluded: state.prefs.excluded } });
    case "goTo":
      if (!canGoTo(state, action.step)) return state;
      // Leaving the results drops a queued re-run; the result then shows as stale.
      return { ...state, step: action.step, autoRun: action.step === 4 && state.autoRun };
    case "solveStart":
      return {
        ...state,
        step: 4,
        solverStatus: "running",
        error: null,
        autoRun: false,
        request: { id: action.id, version: state.version },
      };
    case "solveDone":
      if (!isCurrent(state, action.id)) return state;
      return {
        ...state,
        solverStatus: "done",
        result: { ...action.outcome, id: action.id, version: state.request!.version },
        selected: 0,
        request: null,
      };
    case "solveFailed":
      if (!isCurrent(state, action.id)) return state;
      return { ...state, solverStatus: "error", error: action.error, request: null };
    case "solveCancelled":
      if (!isCurrent(state, action.id)) return state;
      return { ...state, solverStatus: "idle", request: null };
    case "cancelAutoRun":
      return state.autoRun ? { ...state, autoRun: false } : state;
    case "selectSchedule": {
      const count = state.result?.result.schedules.length ?? 0;
      const index = Math.min(Math.max(0, Math.trunc(action.index)), Math.max(0, count - 1));
      return index === state.selected ? state : { ...state, selected: index };
    }
    case "lock":
      return withSelections(state, lockGroup(selectionsOf(state), action.courseCode, action.groupId));
    case "unlock":
      return withSelections(state, unlockCourse(selectionsOf(state), action.courseCode));
    case "exclude":
      return withSelections(state, excludeGroup(selectionsOf(state), action.key));
    case "unexclude":
      return withSelections(state, unexcludeGroup(selectionsOf(state), action.key));
    case "clearSelections":
      return withSelections(state, { locked: {}, excluded: [], autoLocked: [] });
    case "markFullAndRerun": {
      const schedule = state.result?.result.schedules[state.selected];
      const picks = (schedule?.picks ?? []).map((p) => ({ courseCode: p.courseCode, groupId: p.group.group.id }));
      return withSelections(state, markFull(selectionsOf(state), action.key, picks));
    }
    case "undoAutoLocks":
      return withSelections(state, undoAutoLocks(selectionsOf(state)));
  }
}
