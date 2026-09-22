import type { Schedule } from "../solver";

/** "Sao chép tất cả": one line per course, "CO2007  L01_L02" (two spaces). */
export function checklistText(schedule: Schedule): string {
  return schedule.picks.map((pick) => `${pick.courseCode}  ${pick.group.group.id}`).join("\n");
}

/**
 * Credits of the schedule. 0 counts as 0; a course whose credits are unknown
 * (no summary row) is listed in `unknown` instead of being silently added as 0.
 */
export function scheduleCredits(schedule: Schedule, credits: Record<string, number | null | undefined>): { total: number; unknown: string[] } {
  let total = 0;
  const unknown: string[] = [];
  for (const pick of schedule.picks) {
    const value = credits[pick.courseCode];
    if (typeof value === "number") total += value;
    else unknown.push(pick.courseCode);
  }
  return { total, unknown };
}
