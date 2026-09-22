import { normalizePreferences, type Preferences } from "../lib/solver";
import type { Paste } from "./pastes";
import { groupIdsByCourse, pruneSelections } from "./selection";
import { defaultPrefs } from "./state";

/** Only the raw pasted text, the preferences (with locks) and the auto-lock marks are stored; results never are. */
export const STORAGE_KEY = "tkb:v1";

export interface SavedState {
  pastes: Paste[];
  prefs: Preferences;
  /** Keys of locks the app added itself (see selection.ts). */
  autoLocked: string[];
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
    locked: objectOr(s.locked),
    excluded: s.excluded,
  };
  return normalizePreferences(merged as unknown as Preferences);
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function empty(): SavedState {
  return { pastes: [], prefs: defaultPrefs(), autoLocked: [] };
}

/**
 * Loads saved pastes, prefs and auto-lock marks; missing, blocked or corrupt
 * storage → defaults. Locks and excluded keys whose course or group is no
 * longer pasted are dropped. Never throws.
 */
export function loadSaved(storage: StorageLike | null = browserStorage()): SavedState {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return empty();
    const data = objectOr(JSON.parse(text));
    const pastes = readPastes(data.pastes);
    const prefs = readPrefs(data.prefs);
    const pruned = pruneSelections(
      { locked: prefs.locked, excluded: prefs.excluded, autoLocked: readStrings(data.autoLocked) },
      groupIdsByCourse(pastes),
    );
    return { pastes, prefs: { ...prefs, locked: pruned.locked, excluded: pruned.excluded }, autoLocked: pruned.autoLocked };
  } catch {
    return empty();
  }
}

/** Saves pastes, prefs and auto-lock marks; returns false if storage is unavailable or full. Never throws. */
export function saveState(state: SavedState, storage: StorageLike | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify({ pastes: state.pastes, prefs: state.prefs, autoLocked: state.autoLocked }));
    return true;
  } catch {
    return false;
  }
}
