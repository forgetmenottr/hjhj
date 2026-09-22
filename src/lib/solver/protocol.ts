import type { Course } from "../parser";
import { buildMasks, type TimeWarning } from "../timing";
import { solve } from "./solve";
import type { Preferences, SolveResult } from "./types";

/** Main thread → worker. */
export interface SolveRequest {
  id: number;
  courses: Course[];
  prefs: Preferences;
}

/** Worker → main thread. `id` echoes the request so stale responses can be ignored. */
export type SolveResponse =
  | { id: number; ok: true; result: SolveResult; maskWarnings: TimeWarning[] }
  | { id: number; ok: false; error: string };

/** Reads the id of anything that looks like a request; -1 otherwise. */
function requestId(request: unknown): number {
  const id = (request as { id?: unknown } | null)?.id;
  return typeof id === "number" ? id : -1;
}

/**
 * Runs buildMasks + solve for one request. Pure apart from timing, and never
 * throws: any failure becomes `{ ok: false, error }`.
 */
export function handleRequest(request: unknown): SolveResponse {
  const id = requestId(request);
  try {
    const courses = (request as Partial<SolveRequest> | null)?.courses;
    if (!Array.isArray(courses)) return { id, ok: false, error: "Yêu cầu không hợp lệ: thiếu danh sách môn học." };
    const built = buildMasks(courses);
    const result = solve(built.courses, (request as SolveRequest).prefs);
    return { id, ok: true, result, maskWarnings: built.warnings };
  } catch (error) {
    return { id, ok: false, error: `Lỗi khi xếp lịch: ${error instanceof Error ? error.message : String(error)}` };
  }
}
