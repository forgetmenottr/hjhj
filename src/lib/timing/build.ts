import type { Course, Group, Session } from "../parser";
import { MAX_WEEK, PERIODS, type TimeMask } from "./constants";
import { emptyMask, intersects, orInto, setSlot } from "./mask";

/** A problem found while building masks. `groupId` is "" for course-level warnings. */
export interface TimeWarning {
  courseCode: string;
  groupId: string;
  message: string;
}

export interface IndexedGroup {
  /** `${courseCode}:${groupId}`, unique across the result. */
  key: string;
  courseCode: string;
  /** The original Phase 1 object, unchanged. */
  group: Group;
  /** Union of all its sessions. */
  mask: TimeMask;
}

export interface IndexedCourse {
  code: string;
  name: string;
  credits: number | null;
  groups: IndexedGroup[];
}

/** Sets every (week, period) slot of a session; counts the slots that were out of range. */
export function buildSessionMask(s: Session): { mask: TimeMask; outOfRange: number } {
  const mask = emptyMask();
  let outOfRange = 0;
  for (const week of s.weeks) {
    for (const period of s.periods) {
      if (!setSlot(mask, week, s.day, period)) outOfRange++;
    }
  }
  return { mask, outOfRange };
}

/**
 * Builds one mask per group. Never mutates `courses`.
 * When a course code (or a group id within a course) appears twice, the later
 * occurrence wins: it replaces the earlier one in place, with a warning.
 */
export function buildMasks(courses: Course[]): { courses: IndexedCourse[]; warnings: TimeWarning[] } {
  const warnings: TimeWarning[] = [];
  const unique = latestByKey(courses, (course) => course.code, (course) =>
    warnings.push({ courseCode: course.code, groupId: "", message: "course appears more than once; the later copy replaces the earlier one" }),
  );
  return { courses: unique.map((course) => indexCourse(course, warnings)), warnings };
}

/** Indexes the groups of one course; a repeated group id replaces the earlier one. */
function indexCourse(course: Course, warnings: TimeWarning[]): IndexedCourse {
  const unique = latestByKey(course.groups, (group) => group.id, (group) =>
    warnings.push({ courseCode: course.code, groupId: group.id, message: "group appears more than once; the later copy replaces the earlier one" }),
  );
  const groups = unique.map((group) => indexGroup(course.code, group, warnings));
  return { code: course.code, name: course.name, credits: course.credits, groups };
}

/** One item per key; a later item replaces an earlier one at the earlier position. */
function latestByKey<T>(items: T[], keyOf: (item: T) => string, onDuplicate: (item: T) => void): T[] {
  const byKey = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (byKey.has(key)) onDuplicate(item);
    byKey.set(key, item); // Map keeps the first insertion position
  }
  return [...byKey.values()];
}

/** Unions the session masks of a group, warning on out-of-range slots and internal overlaps. */
function indexGroup(courseCode: string, group: Group, warnings: TimeWarning[]): IndexedGroup {
  const warn = (message: string) => warnings.push({ courseCode, groupId: group.id, message });
  const mask = emptyMask();
  const sessionMasks: TimeMask[] = [];

  group.sessions.forEach((session, index) => {
    const built = buildSessionMask(session);
    if (built.outOfRange > 0) {
      warn(
        `session ${describe(session)}: ${built.outOfRange} slot(s) outside weeks 1-${MAX_WEEK} / periods 1-${PERIODS} skipped`,
      );
    }
    sessionMasks.forEach((earlier, earlierIndex) => {
      if (intersects(earlier, built.mask)) {
        warn(`internal overlap: session ${index + 1} overlaps session ${earlierIndex + 1} (${describe(session)})`);
      }
    });
    sessionMasks.push(built.mask);
    orInto(mask, built.mask);
  });

  return { key: `${courseCode}:${group.id}`, courseCode, group, mask };
}

/** Short human-readable label, e.g. "day 2, periods 2,3,4, room A4-409". */
function describe(s: Session): string {
  return `day ${s.day}, periods ${s.periods.join(",")}, room ${s.room}`;
}
