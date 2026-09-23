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
    expect(loaded.pastes).toEqual([{ code: "CO2007", raw: "x", pastedAt: null }]);
    const expected = defaultPrefs();
    expected.weights.fewerDays = 9;
    expect(loaded.prefs).toEqual(expected); // the lock is dropped: "x" has no group A01_A01
    expect(loaded).toMatchObject({ autoLocked: [], registered: [], semesterStart: null });
  });

  it("migrates a save written before paste timestamps: pastedAt becomes null", () => {
    // Exactly what Phase 6 wrote: { code, raw } with no pastedAt.
    const old = { pastes: PASTES.map(({ code, raw }) => ({ code, raw })), prefs: {}, autoLocked: [], registered: [], semesterStart: null };
    const loaded = loadSaved(memoryStorage({ [STORAGE_KEY]: JSON.stringify(old) }));
    expect(loaded.pastes.map((p) => p.code)).toEqual(PASTES.map((p) => p.code));
    expect(loaded.pastes.map((p) => p.pastedAt)).toEqual(PASTES.map(() => null));
    expect(loaded.pastes.map((p) => p.raw)).toEqual(PASTES.map((p) => p.raw));
    // An unreadable value is dropped the same way; a real one is kept.
    const mixed = { pastes: [{ code: "CO2007", raw: "x", pastedAt: 1234 }, { code: "CO2011", raw: "y", pastedAt: "2026-09-23T04:00:00.000Z" }] };
    const both = loadSaved(memoryStorage({ [STORAGE_KEY]: JSON.stringify(mixed) })).pastes;
    expect(both.map((p) => p.pastedAt)).toEqual([null, "2026-09-23T04:00:00.000Z"]);
  });

  it("round-trips the new program and half-day-off requirements", () => {
    const storage = memoryStorage();
    const prefs = defaultPrefs();
    prefs.programs = { mode: "required", allowed: ["L"] };
    prefs.partsOff = { mode: "preferred", parts: [{ day: 2, part: "morning" }, { day: 6, part: "afternoon" }] };
    prefs.daysOff = { mode: "preferred", days: [8] };
    expect(saveState(saved({ prefs }), storage)).toBe(true);
    const loaded = loadSaved(storage).prefs;
    expect(loaded.programs).toEqual({ mode: "required", allowed: ["L"] });
    expect(loaded.partsOff).toEqual({ mode: "preferred", parts: [{ day: 2, part: "morning" }, { day: 6, part: "afternoon" }] });
  });

  it("gives a save without the new requirements their defaults", () => {
    const stored = { pastes: [], prefs: { freeSeats: { mode: "required" } } };
    const loaded = loadSaved(memoryStorage({ [STORAGE_KEY]: JSON.stringify(stored) })).prefs;
    expect(loaded.programs).toEqual({ mode: "required", allowed: [] }); // app default: required, nothing chosen
    expect(loaded.partsOff).toEqual({ mode: "off", parts: [] });
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
