import { describe, expect, it } from "vitest";
import { splitByCourse } from "../src/app/pastes";
import { defaultPrefs } from "../src/app/state";
import { loadSaved, saveState, STORAGE_KEY } from "../src/app/storage";
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

describe("storage", () => {
  it("round-trips pastes and prefs under tkb:v1", () => {
    const storage = memoryStorage();
    const prefs = defaultPrefs();
    prefs.freeSeats.mode = "required";
    prefs.daysOff = { mode: "preferred", days: [2, 8] };
    prefs.weights.fewerDays = 9;

    expect(saveState({ pastes: PASTES, prefs }, storage)).toBe(true);
    expect([...storage.data.keys()]).toEqual([STORAGE_KEY]);
    expect(loadSaved(storage)).toEqual({ pastes: PASTES, prefs });
  });

  it("stores only raw pastes and prefs", () => {
    const storage = memoryStorage();
    saveState({ pastes: PASTES, prefs: defaultPrefs() }, storage);
    expect(Object.keys(JSON.parse(storage.data.get(STORAGE_KEY)!))).toEqual(["pastes", "prefs"]);
  });

  it("falls back to defaults on corrupt or wrongly shaped data", () => {
    const defaults = { pastes: [], prefs: defaultPrefs() };
    for (const text of ["{not json", "null", "42", '"text"', '{"pastes":"x","prefs":5}', "[]"]) {
      expect(loadSaved(memoryStorage({ [STORAGE_KEY]: text })), text).toEqual(defaults);
    }
    expect(loadSaved(memoryStorage())).toEqual(defaults);
  });

  it("keeps defaults for fields an older or partial copy lacks", () => {
    const stored = { pastes: [{ code: "CO2007", raw: "x" }, { code: 5 }, "junk"], prefs: { weights: { fewerDays: 9 }, locked: { CO2007: "A01_A01" } } };
    const loaded = loadSaved(memoryStorage({ [STORAGE_KEY]: JSON.stringify(stored) }));
    expect(loaded.pastes).toEqual([{ code: "CO2007", raw: "x" }]);
    const expected = defaultPrefs();
    expected.weights.fewerDays = 9;
    expect(loaded.prefs).toEqual(expected); // locked is always emptied in Phase 4
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
    expect(loadSaved(broken)).toEqual({ pastes: [], prefs: defaultPrefs() });
    expect(saveState({ pastes: PASTES, prefs: defaultPrefs() }, broken)).toBe(false);
    expect(loadSaved(null)).toEqual({ pastes: [], prefs: defaultPrefs() });
    expect(saveState({ pastes: [], prefs: defaultPrefs() }, null)).toBe(false);
    // Default argument: whatever this environment offers as localStorage.
    expect(() => loadSaved()).not.toThrow();
  });
});
