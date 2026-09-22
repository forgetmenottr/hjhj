import { describe, expect, it } from "vitest";
import { parse, type Course } from "../src/lib/parser";
import { DEFAULT_PREFERENCES, solve } from "../src/lib/solver";
import { handleRequest } from "../src/lib/solver/protocol";
import { buildMasks } from "../src/lib/timing";
import { ALL_FIXTURES, readFixture } from "./fixtureText";

const COURSES: Course[] = ALL_FIXTURES.flatMap((name) => parse(readFixture(name)).courses);
const PREFS = structuredClone(DEFAULT_PREFERENCES);

describe("handleRequest", () => {
  it("builds masks and solves the fixtures", () => {
    const response = handleRequest({ id: 7, courses: COURSES, prefs: PREFS });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.id).toBe(7);
    expect(response.maskWarnings).toEqual([]);
    expect(response.result.status).toBe("ok");
    expect(response.result.schedules).toHaveLength(5);
    // Same schedules as calling the library directly.
    const direct = solve(buildMasks(COURSES).courses, PREFS);
    expect(response.result.schedules).toEqual(direct.schedules);
  });

  it("returns a response that survives structured cloning (postMessage)", () => {
    const response = handleRequest({ id: 1, courses: COURSES, prefs: PREFS });
    expect(structuredClone(response)).toEqual(response);
  });

  it("tolerates malformed preferences", () => {
    const response = handleRequest({ id: 2, courses: COURSES, prefs: { weights: "x" } });
    expect(response).toMatchObject({ id: 2, ok: true });
  });

  it("returns ok:false instead of throwing on bad input", () => {
    const bad: unknown[] = [
      null,
      undefined,
      42,
      {},
      { id: 3, courses: "x", prefs: PREFS },
      { id: 4, courses: [{ code: "CO2007", name: "x", credits: null, groups: [{ id: "A01", sessions: null }] }], prefs: PREFS },
    ];
    for (const request of bad) {
      let response: ReturnType<typeof handleRequest> | undefined;
      expect(() => (response = handleRequest(request))).not.toThrow();
      expect(response!.ok, JSON.stringify(request)).toBe(false);
      if (!response!.ok) expect(response!.error.length).toBeGreaterThan(0);
    }
    expect(handleRequest(null).id).toBe(-1);
    expect(handleRequest({ id: 3, courses: "x" }).id).toBe(3);
  });
});
