import { DEFAULT_PREFERENCES, type Preferences, type SolveResult } from "../lib/solver";
import type { SolveResponse } from "../lib/solver/protocol";
import type { TimeWarning } from "../lib/timing";
import { mergePastes, schedulableCourses, splitByCourse, type Paste } from "./pastes";

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
  | { type: "solveCancelled"; id: number };

/**
 * App defaults: the solver's defaults, plus "Còn chỗ trống" as a preference so
 * the first suggestions avoid groups that are already full. Locking and
 * excluding are Phase 5, so both stay empty.
 */
export function defaultPrefs(): Preferences {
  const prefs = structuredClone(DEFAULT_PREFERENCES);
  prefs.freeSeats.mode = "preferred";
  return prefs;
}

export function initialState(saved?: { pastes: Paste[]; prefs: Preferences }): AppState {
  return {
    pastes: saved?.pastes ?? [],
    prefs: saved?.prefs ?? defaultPrefs(),
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
      return changed(state, { pastes, notice: { added, replaced, empty: false } });
    }
    case "removeCourse": {
      const pastes = state.pastes.filter((p) => p.code !== action.code);
      const step = hasSchedulableCourse(pastes) ? state.step : 1;
      return changed(state, { pastes, step, notice: null });
    }
    case "setPrefs":
      return changed(state, { prefs: { ...action.prefs, locked: {}, excluded: [] } });
    case "resetPrefs":
      return changed(state, { prefs: defaultPrefs() });
    case "goTo":
      return canGoTo(state, action.step) ? { ...state, step: action.step } : state;
    case "solveStart":
      return {
        ...state,
        step: 4,
        solverStatus: "running",
        error: null,
        request: { id: action.id, version: state.version },
      };
    case "solveDone":
      if (!isCurrent(state, action.id)) return state;
      return {
        ...state,
        solverStatus: "done",
        result: { ...action.outcome, id: action.id, version: state.request!.version },
        request: null,
      };
    case "solveFailed":
      if (!isCurrent(state, action.id)) return state;
      return { ...state, solverStatus: "error", error: action.error, request: null };
    case "solveCancelled":
      if (!isCurrent(state, action.id)) return state;
      return { ...state, solverStatus: "idle", request: null };
  }
}
