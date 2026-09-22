import { describe, expect, it } from "vitest";
import { splitByCourse } from "../src/app/pastes";
import { defaultPrefs } from "../src/app/state";
import { loadSaved, readDate, saveState, STORAGE_KEY, type SavedState } from "../src/app/storage";
import { readFixture } from "./fixtureText";

/** In-memory stand-in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const PASTES = splitByCourse(`${readFixture("CO2007.txt")}\n${readFixture("CO2011.txt")}`);
const DEFAULTS: SavedState = { pastes: [], prefs: defaultPrefs(), autoLocked: [], registered: [], semesterStart: null };
const saved = (patch: Partial<SavedState>): SavedState => ({ ...DEFAULTS, pastes: PASTES, ...patch });

describe("storage", () => {
  it("round-trips pastes, prefs (with locks), marks and the semester start under tkb:v1", () => {
    const storage = memoryStorage();
    const prefs = defaultPrefs();
    prefs.freeSeats.mode = "required";
    prefs.daysOff = { mode: "preferred", days: [2, 8] };
    prefs.weights.fewerDays = 9;
    prefs.locked = { CO2007: "A01_A01", CO2011: "L02" };
    prefs.excluded = ["CO2011:L01"];
    const state = saved({ prefs, autoLocked: ["CO2011:L02"], registered: ["CO2007:A01_A01"], semesterStart: "2026-09-07" });

    expect(saveState(state, storage)).toBe(true);
    expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);
    expect(loadSaved(storage)).toEqual(state);
  });

  it("stores only raw pastes, prefs, marks and the semester start", () => {
    const storage = memoryStorage();
    saveState(saved({}), storage);
    expect(Object.keys(JSON.parse(storage.data.get(STORAGE_KEY)!))).toEqual(["pastes", "prefs", "autoLocked", "registered", "semesterStart"]);
  });

  it("falls back to defaults on corrupt or wrongly shaped data", () => {
    for (const text of ["{not json", "null", "42", '"text"', '{"pastes":"x","prefs":5}', "[]"]) {
      expect(loadSaved(memoryStorage({ [STORAGE_KEY]: text })), text).toEqual(DEFAULTS);
    }
    expect(loadSaved(memoryStorage())).toEqual(DEFAULTS);
  });

  it("keeps defaults for fields an older or partial copy lacks", () => {
    const stored = { pastes: [{ code: "CO2007", raw: "x" }, { code: 5 }, "junk"], prefs: { weights: { fewerDays: 9 }, locked: { CO2007: "A01_A01" } } };
    const loaded = loadSaved(memoryStorage({ [STORAGE_KEY]: JSON.stringify(stored) }));
    expect(loaded.pastes).toEqual([{ code: "CO2007", raw: "x" }]);
    const expected = defaultPrefs();
    expected.weights.fewerDays = 9;
    expect(loaded.prefs).toEqual(expected); // the lock is dropped: "x" has no group A01_A01
    expect(loaded).toMatchObject({ autoLocked: [], registered: [], semesterStart: null });
  });

  it("accepts only real dates as the semester start", () => {
    expect(readDate("2026-09-07")).toBe("2026-09-07");
    for (const bad of ["2026-02-30", "2026-9-7", "07/09/2026", "", 20260907, null, undefined]) expect(readDate(bad), String(bad)).toBeNull();
    const stored = { pastes: [], prefs: {}, semesterStart: "2026-13-01" };
    expect(loadSaved(memoryStorage({ [STORAGE_KEY]: JSON.stringify(stored) })).semesterStart).toBeNull();
  });

  it("never throws when storage is missing or broken", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadSaved(broken)).toEqual(DEFAULTS);
    expect(saveState(saved({}), broken)).toBe(false);
    expect(loadSaved(null)).toEqual(DEFAULTS);
    expect(saveState(DEFAULTS, null)).toBe(false);
    // Default argument: whatever this environment offers as localStorage.
    expect(() => loadSaved()).not.toThrow();
  });
});
