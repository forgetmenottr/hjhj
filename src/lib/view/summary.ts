import type { Schedule, Violation } from "../solver";

/**
 * Violations of constraints the user marked "Bắt buộc" that the solver had to
 * relax (`SolveResult.relaxed`). The solver's `score` leaves these out, so the
 * UI must not present such a schedule by its score alone.
 */
export function relaxedViolations(schedule: Schedule, relaxed: readonly string[]): Violation[] {
  return schedule.violations.filter((v) => relaxed.includes(v.item));
}

/** Violations of "Ưu tiên" constraints (already counted in the score). */
export function preferredViolations(schedule: Schedule, relaxed: readonly string[]): Violation[] {
  return schedule.violations.filter((v) => !relaxed.includes(v.item));
}

/** "Lịch 2 · 87 điểm", or "Lịch 2 · ⚠ 1 yêu cầu" when it breaks relaxed requirements. */
export function scheduleLabel(schedule: Schedule, index: number, relaxed: readonly string[]): string {
  const broken = relaxedViolations(schedule, relaxed).length;
  return broken > 0 ? `Lịch ${index + 1} · ⚠ ${broken} yêu cầu` : `Lịch ${index + 1} · ${schedule.score} điểm`;
}
