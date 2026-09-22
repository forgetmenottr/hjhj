import type { CSSProperties } from "react";
import { assignLanes, describeBlock, periodRange, usedDays, type GridBlock } from "../lib/view/grid";
import { campusLabel, DAY_LONG, formatWeekList } from "../lib/view/format";
import { courseColor } from "./courseColor";

/** Height of one period row, in px. */
const ROW = 48;

/**
 * Weekly grid (md and up): columns = days with classes, rows = used periods.
 * It shows the UNION of all weeks; blocks that share periods on different weeks
 * (e.g. alternating labs) are placed side by side.
 */
export function TimetableGrid({ blocks }: { blocks: GridBlock[] }) {
  const days = usedDays(blocks);
  const range = periodRange(blocks);
  const placedByDay = new Map(days.map((day) => [day, assignLanes(blocks.filter((b) => b.day === day))]));
  if (!range) return null;
  const periods = Array.from({ length: range.last - range.first + 1 }, (_, i) => range.first + i);
  const height = periods.length * ROW;
  const lines: CSSProperties = {
    height,
    backgroundImage: `repeating-linear-gradient(to bottom, transparent 0 ${ROW - 1}px, var(--color-ctp-surface0) ${ROW - 1}px ${ROW}px)`,
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-ctp-surface0 bg-ctp-mantle p-3">
      <div className="grid min-w-[36rem] gap-x-1" style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((day) => (
          <div key={day} className="pb-2 text-center text-sm font-semibold">
            {DAY_LONG[day]}
          </div>
        ))}

        <div aria-hidden="true">
          {periods.map((p) => (
            <div key={p} style={{ height: ROW }} className="pr-2 text-right text-xs leading-none text-ctp-subtext">
              Tiết {p}
            </div>
          ))}
        </div>

        {days.map((day) => (
          <ul key={day} aria-label={DAY_LONG[day]} className="relative rounded-lg" style={lines}>
            {(placedByDay.get(day) ?? []).map(({ block, lane, lanes }, i) => (
              <li
                key={i}
                title={describeBlock(block)}
                aria-label={describeBlock(block)}
                className="course-block absolute overflow-hidden rounded-md px-1.5 py-1 text-xs leading-tight"
                style={{
                  ...courseColor(block.colorIndex),
                  top: (block.startPeriod - range.first) * ROW + 2,
                  height: (block.endPeriod - block.startPeriod + 1) * ROW - 4,
                  left: `calc(${lane} * 100% / ${lanes} + 2px)`,
                  width: `calc(100% / ${lanes} - 4px)`,
                }}
              >
                <p className="flex flex-wrap items-center gap-1 font-semibold">
                  {block.courseCode}
                  {block.kind === "lab" && <span className="rounded bg-ctp-crust/60 px-1 text-[10px] font-bold text-ctp-text">TN</span>}
                </p>
                <p className="text-ctp-text/90">
                  {block.room} · {campusLabel(block.campus)}
                </p>
                {block.kind === "lab" && <p className="text-ctp-text/90">tuần {formatWeekList(block.weeks)}</p>}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
