import { normalizePreferences, type Preferences } from "../lib/solver";
import type { Paste } from "./pastes";
import { defaultPrefs } from "./state";

/** Only the raw pasted text and the preferences are stored; results never are. */
export const STORAGE_KEY = "tkb:v1";

export interface SavedState {
  pastes: Paste[];
  prefs: Preferences;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** localStorage, or null where it is missing or blocked (accessing it can throw). */
function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectOr(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}

/** Keeps well-formed { code, raw } entries; a repeated code replaces the earlier entry in place. */
function readPastes(value: unknown): Paste[] {
  if (!Array.isArray(value)) return [];
  const byCode = new Map<string, Paste>();
  for (const item of value) {
    if (isObject(item) && typeof item.code === "string" && typeof item.raw === "string") {
      byCode.set(item.code, { code: item.code, raw: item.raw });
    }
  }
  return [...byCode.values()];
}

/**
 * Stored preferences over the defaults, field by field, so an older or partial
 * copy keeps default values for what it lacks. Then normalized.
 */
function readPrefs(value: unknown): Preferences {
  const d = defaultPrefs();
  const s = objectOr(value);
  const w = objectOr(s.weights);
  const merged = {
    ...d,
    campuses: { ...d.campuses, ...objectOr(s.campuses) },
    daysOff: { ...d.daysOff, ...objectOr(s.daysOff) },
    language: { ...d.language, ...objectOr(s.language) },
    freeSeats: { ...d.freeSeats, ...objectOr(s.freeSeats) },
    avoidLecturers: { ...d.avoidLecturers, ...objectOr(s.avoidLecturers) },
    weights: { ...d.weights, ...w, timeOfDay: { ...d.weights.timeOfDay, ...objectOr(w.timeOfDay) } },
    topK: s.topK ?? d.topK,
    maxNodes: s.maxNodes ?? d.maxNodes,
    locked: {},
    excluded: [],
  };
  return normalizePreferences(merged as unknown as Preferences);
}

/** Loads saved pastes and prefs; missing, blocked or corrupt storage → defaults. Never throws. */
export function loadSaved(storage: StorageLike | null = browserStorage()): SavedState {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return { pastes: [], prefs: defaultPrefs() };
    const data = objectOr(JSON.parse(text));
    return { pastes: readPastes(data.pastes), prefs: readPrefs(data.prefs) };
  } catch {
    return { pastes: [], prefs: defaultPrefs() };
  }
}

/** Saves pastes and prefs; returns false if storage is unavailable or full. Never throws. */
export function saveState(state: SavedState, storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify({ pastes: state.pastes, prefs: state.prefs }));
    return true;
  } catch {
    return false;
  }
}
