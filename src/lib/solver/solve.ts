import type { Day } from "../parser";
import { conflicts, conflictSummary, type ConflictSummaryItem, type IndexedCourse, type IndexedGroup } from "../timing";
import { RELAX_WEIGHT } from "./constants";
import { buildCandidates } from "./equivalence";
import { applyConstraints, applyHardRules, constraintsWithMode } from "./filter";
import { createScorer, type Scorer } from "./score";
import { orderByMrv, search, type Found } from "./search";
import { normalizePreferences, type ConstraintName, type Preferences, type Schedule, type SolveResult } from "./types";

/** Outcome of one search over fixed allowed groups. */
interface Attempt {
  schedules: Schedule[];
  nodes: number;
  truncated: boolean;
  /** Schedules removed by the final conflict check (always 0 unless there is a bug). */
  dropped: number;
}

/**
 * Finds the top-K conflict-free schedules (one group per course).
 * 1. strict: required constraints filter groups;
 * 2. relaxed: if that fails, required constraints become soft (RELAX_WEIGHT);
 * 3. infeasible: otherwise, with diagnostics.
 * Locked / excluded groups and "no conflict" are always hard. Never throws on bad input.
 * All attempts share one `maxNodes` budget.
 */
export function solve(courses: IndexedCourse[], input: Preferences): SolveResult {
  const started = performance.now();
  const prefs = normalizePreferences(input);
  const list = Array.isArray(courses) ? courses : [];
  const diagnostics: string[] = [];
  let nodes = 0;
  let truncated = false;

  const finish = (status: SolveResult["status"], schedules: Schedule[], relaxed: string[]): SolveResult => ({
    status,
    schedules,
    relaxed,
    diagnostics,
    stats: { nodes, ms: performance.now() - started, truncated },
  });
  const run = (allowed: IndexedGroup[][], relaxed: ConstraintName[]): Schedule[] => {
    const result = attempt(list, allowed, prefs, relaxed, prefs.maxNodes - nodes);
    nodes += result.nodes;
    truncated ||= result.truncated;
    if (result.dropped > 0) diagnostics.push(`Internal check dropped ${result.dropped} schedule(s) with a time conflict.`);
    return result.schedules;
  };

  if (list.length === 0) {
    diagnostics.push("No courses to schedule.");
    return finish("ok", [], []);
  }

  const required = constraintsWithMode(prefs, "required");
  const hard = list.map((course) => applyHardRules(course, prefs));
  const strict = hard.map((groups) => applyConstraints(groups, required, prefs));

  if (strict.every(nonEmpty)) {
    const schedules = run(strict, []);
    if (schedules.length > 0) return finish("ok", schedules, []);
  }

  if (required.length > 0) {
    diagnostics.push(...explainRequired(list, hard, strict, required, prefs));
    if (hard.every(nonEmpty)) {
      const schedules = run(hard, required);
      if (schedules.length > 0) {
        diagnostics.push(`Relaxed to soft penalties (weight ${RELAX_WEIGHT}): ${required.join(", ")}.`);
        return finish("relaxed", schedules, [...required]);
      }
    }
  }

  diagnostics.push(...explainInfeasible(list, hard, prefs, required.length > 0));
  if (truncated) {
    diagnostics.push(`Search stopped after ${nodes} nodes (maxNodes = ${prefs.maxNodes}); a schedule may exist beyond that limit.`);
  }
  return finish("infeasible", [], []);
}

function nonEmpty<T>(items: T[]): boolean {
  return items.length > 0;
}

/** Searches once over the allowed groups of every course. */
function attempt(
  courses: IndexedCourse[],
  allowed: IndexedGroup[][],
  prefs: Preferences,
  relaxed: ConstraintName[],
  budget: number,
): Attempt {
  const scorer = createScorer(prefs, relaxed);
  const domains = courses.map((course, courseIndex) => ({
    courseIndex,
    courseCode: course.code,
    candidates: buildCandidates(course.code, allowed[courseIndex], prefs),
  }));
  const result = search(orderByMrv(domains), scorer, prefs.topK, budget);
  const schedules = result.found.map((found) => toSchedule(found, scorer));
  const valid = schedules.filter(isConflictFree);
  return { schedules: valid, nodes: result.nodes, truncated: result.truncated, dropped: schedules.length - valid.length };
}

function toSchedule(found: Found, scorer: Scorer): Schedule {
  const parts = scorer.explain(found.picks);
  return {
    picks: found.picks.map((c) => ({ courseCode: c.courseCode, group: c.group, alternatives: [...c.alternatives] })),
    penalty: found.penalty,
    score: parts.score,
    breakdown: parts.breakdown,
    violations: parts.violations,
  };
}

/** Cheap final guard: no two picks share a slot. */
function isConflictFree(schedule: Schedule): boolean {
  const { picks } = schedule;
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      if (conflicts(picks[i].group, picks[j].group)) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** Why the strict attempt failed: courses emptied by required constraints, or no combination. */
function explainRequired(
  courses: IndexedCourse[],
  hard: IndexedGroup[][],
  strict: IndexedGroup[][],
  required: ConstraintName[],
  prefs: Preferences,
): string[] {
  const lines = courses.flatMap((course, i) => {
    if (hard[i].length === 0 || strict[i].length > 0) return [];
    const blocking = required.filter((name) => applyConstraints(hard[i], [name], prefs).length === 0);
    return blocking.length > 0
      ? [`${course.code}: no group meets the required ${blocking.join(", ")}.`]
      : [`${course.code}: no group meets all required constraints together (${required.join(", ")}).`];
  });
  if (lines.length === 0 && strict.every(nonEmpty)) {
    lines.push(`No conflict-free combination meets every required constraint (${required.join(", ")}).`);
  }
  return lines;
}

/** Why nothing works even with required constraints relaxed. */
function explainInfeasible(courses: IndexedCourse[], hard: IndexedGroup[][], prefs: Preferences, afterRelax: boolean): string[] {
  const lines = courses.flatMap((course, i) => (hard[i].length === 0 ? [`${course.code}: ${whyEmpty(course, prefs)}.`] : []));
  const locked = courses.flatMap((course, i) =>
    prefs.locked[course.code] !== undefined && hard[i].length === 1 ? [hard[i][0]] : [],
  );

  for (let i = 0; i < locked.length; i++) {
    for (let j = i + 1; j < locked.length; j++) {
      const [a, b] = [locked[i], locked[j]];
      if (conflicts(a, b)) lines.push(`Locked groups ${a.key} and ${b.key} overlap: ${describeOverlap(conflictSummary(a, b))}.`);
    }
  }

  courses.forEach((course, i) => {
    const others = locked.filter((g) => g.courseCode !== course.code);
    if (prefs.locked[course.code] !== undefined || hard[i].length === 0 || others.length === 0) return;
    if (hard[i].every((g) => others.some((l) => conflicts(g, l)))) {
      lines.push(`${course.code}: every group conflicts with the locked group(s) ${others.map((g) => g.key).join(", ")}.`);
    }
  });

  if (lines.length === 0) {
    lines.push(`No conflict-free combination of groups exists${afterRelax ? ", even with the required constraints relaxed" : ""}.`);
  }
  return lines;
}

/** Why a course has no group left after locked / excluded rules. */
function whyEmpty(course: IndexedCourse, prefs: Preferences): string {
  if (course.groups.length === 0) return "the course has no groups";
  const lockedId = prefs.locked[course.code];
  if (lockedId === undefined) return `all ${course.groups.length} groups are excluded`;
  const key = `${course.code}:${lockedId}`;
  return course.groups.some((g) => g.group.id === lockedId)
    ? `locked group ${key} is excluded`
    : `locked group ${key} does not exist`;
}

const DAY_NAMES: Record<Day, string> = {
  2: "Monday (Thứ 2)",
  3: "Tuesday (Thứ 3)",
  4: "Wednesday (Thứ 4)",
  5: "Thursday (Thứ 5)",
  6: "Friday (Thứ 6)",
  7: "Saturday (Thứ 7)",
  8: "Sunday (Chủ nhật)",
};

/** e.g. "Monday (Thứ 2) periods 2-3 (weeks 1-7, 9-16)". */
function describeOverlap(items: ConflictSummaryItem[]): string {
  return items
    .map((item) => `${DAY_NAMES[item.day]} periods ${formatRuns(item.periods)} (weeks ${formatRuns(item.weeks)})`)
    .join("; ");
}

/** [1,2,3,5] → "1-3, 5". */
function formatRuns(numbers: number[]): string {
  const runs: string[] = [];
  let start = 0;
  for (let i = 1; i <= numbers.length; i++) {
    if (i < numbers.length && numbers[i] === numbers[i - 1] + 1) continue;
    runs.push(i - 1 === start ? `${numbers[start]}` : `${numbers[start]}-${numbers[i - 1]}`);
    start = i;
  }
  return runs.join(", ");
}
