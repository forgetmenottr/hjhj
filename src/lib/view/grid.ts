import type { Course, Day } from "../parser";
import type { Schedule } from "../solver";
import { campusLabel, contiguousRuns, DAY_LONG, formatRanges, formatWeekList, formatWeeks } from "./format";

/** One rectangle on the weekly grid: a run of consecutive periods of one session. */
export interface GridBlock {
  day: Day;
  startPeriod: number;
  endPeriod: number;
  courseCode: string;
  groupId: string;
  room: string;
  campus: 1 | 2 | null;
  kind: "theory" | "lab";
  weeks: number[];
  /** Index of the course in the schedule's pick order, so a course keeps its color. */
  colorIndex: number;
}

/** Order: day, start period, end period, course code, kind. */
function compareBlocks(a: GridBlock, b: GridBlock): number {
  return (
    a.day - b.day ||
    a.startPeriod - b.startPeriod ||
    a.endPeriod - b.endPeriod ||
    (a.courseCode < b.courseCode ? -1 : a.courseCode > b.courseCode ? 1 : 0) ||
    (a.kind === b.kind ? 0 : a.kind === "theory" ? -1 : 1)
  );
}

/**
 * Every session of every pick as grid blocks (union of all weeks). Contiguous
 * periods of one session become one block; a gap splits it.
 */
export function toGridBlocks(schedule: Schedule): GridBlock[] {
  const blocks = schedule.picks.flatMap((pick, colorIndex) =>
    pick.group.group.sessions.flatMap((session) =>
      contiguousRuns(session.periods).map(
        ([startPeriod, endPeriod]): GridBlock => ({
          day: session.day,
          startPeriod,
          endPeriod,
          courseCode: pick.courseCode,
          groupId: pick.group.group.id,
          room: session.room,
          campus: session.campus,
          kind: session.kind,
          weeks: [...session.weeks],
          colorIndex,
        }),
      ),
    ),
  );
  return blocks.sort(compareBlocks);
}

/** A week number (1-based) or the union of all weeks. */
export type WeekFilter = number | "all";

/** Blocks that have a class in `week`; "all" keeps every block (the union view). */
export function blocksForWeek(blocks: GridBlock[], week: WeekFilter): GridBlock[] {
  return week === "all" ? blocks : blocks.filter((b) => b.weeks.includes(week));
}

/** Weeks in which at least one block has a class, ascending. */
export function weeksWithClasses(blocks: GridBlock[]): number[] {
  return [...new Set(blocks.flatMap((b) => b.weeks))].sort((a, b) => a - b);
}

/** Most votes first; ties: more weeks, then the smaller key (deterministic). */
function bestWeeks(counts: Map<string, { weeks: number[]; count: number }>): { key: string; weeks: number[] } | null {
  let best: { key: string; weeks: number[]; count: number } | null = null;
  for (const [key, entry] of counts) {
    const better =
      best === null ||
      entry.count > best.count ||
      (entry.count === best.count && (entry.weeks.length > best.weeks.length || (entry.weeks.length === best.weeks.length && key < best.key)));
    if (better) best = { key, ...entry };
  }
  return best;
}

/**
 * The usual term of the pasted courses, e.g. [1..7, 9..16]: each course votes
 * for its most common weeks list among theory sessions, and the list with the
 * most votes wins. Voting per course keeps a course with many short groups
 * (SK2001: 64 five-week groups) from outvoting the rest. Null if no course has
 * a theory session.
 */
export function standardWeeks(courses: Course[]): number[] | null {
  const votes = new Map<string, { weeks: number[]; count: number }>();
  for (const course of courses) {
    const counts = new Map<string, { weeks: number[]; count: number }>();
    for (const group of course.groups) {
      for (const session of group.sessions) {
        if (session.kind !== "theory" || session.weeks.length === 0) continue;
        const key = session.weeks.join(",");
        const entry = counts.get(key) ?? { weeks: session.weeks, count: 0 };
        entry.count++;
        counts.set(key, entry);
      }
    }
    const top = bestWeeks(counts);
    if (!top) continue;
    const entry = votes.get(top.key) ?? { weeks: top.weeks, count: 0 };
    entry.count++;
    votes.set(top.key, entry);
  }
  return bestWeeks(votes)?.weeks ?? null;
}

/**
 * Week text shown on a block: a lab lists its weeks ("tuần 6,10,12,14"); a
 * theory session outside the usual term gets a compact label ("T12–16");
 * a theory session in the usual term gets none.
 */
export function weekLabel(block: GridBlock, standard: number[] | null): string | null {
  if (block.kind === "lab") return `tuần ${formatWeekList(block.weeks)}`;
  if (standard === null) return null;
  const same = block.weeks.length === standard.length && block.weeks.every((week, i) => week === standard[i]);
  return same ? null : formatWeeks(block.weeks);
}

/** First and last period used by any block, or null when there are none. */
export function periodRange(blocks: GridBlock[]): { first: number; last: number } | null {
  if (blocks.length === 0) return null;
  return {
    first: Math.min(...blocks.map((b) => b.startPeriod)),
    last: Math.max(...blocks.map((b) => b.endPeriod)),
  };
}

/** Days that have at least one block, ascending (T2..CN). */
export function usedDays(blocks: GridBlock[]): Day[] {
  return [...new Set(blocks.map((b) => b.day))].sort((a, b) => a - b);
}

/** A block with its horizontal lane within a cluster of time-overlapping blocks. */
export interface PlacedBlock {
  block: GridBlock;
  lane: number;
  lanes: number;
}

/**
 * Places the blocks of ONE day side by side where their periods overlap
 * (possible in the union view, e.g. labs of two courses on alternating weeks).
 * Blocks that overlap nothing get the full width (lanes = 1).
 */
export function assignLanes(dayBlocks: GridBlock[]): PlacedBlock[] {
  const sorted = [...dayBlocks].sort(compareBlocks);
  const placed: PlacedBlock[] = [];
  let cluster: PlacedBlock[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    // A block starting after everything in the current cluster opens a new one.
    if (block.startPeriod > clusterEnd) {
      closeCluster();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end < block.startPeriod);
    if (lane < 0) lane = laneEnds.push(block.endPeriod) - 1;
    else laneEnds[lane] = block.endPeriod;
    cluster.push({ block, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, block.endPeriod);
  }
  closeCluster();
  return placed;
}

/** Full description of a block, for tooltips and screen readers. */
export function describeBlock(b: GridBlock, locked = false): string {
  const weeks = b.kind === "lab" ? ` · thí nghiệm tuần ${formatWeekList(b.weeks)}` : ` · tuần ${formatRanges(b.weeks)}`;
  const lock = locked ? " · đã khoá" : "";
  return `${b.courseCode} ${b.groupId} · ${DAY_LONG[b.day]} tiết ${b.startPeriod}–${b.endPeriod} · ${b.room} · ${campusLabel(b.campus)}${weeks}${lock}`;
}
