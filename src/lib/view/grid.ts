import type { Day } from "../parser";
import type { Schedule } from "../solver";
import { campusLabel, contiguousRuns, DAY_LONG, formatRanges, formatWeekList } from "./format";

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
