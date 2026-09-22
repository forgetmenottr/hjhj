import { usedDays, weekLabel, type GridBlock } from "../lib/view/grid";
import { campusLabel, DAY_LONG } from "../lib/view/format";
import { courseColor } from "./courseColor";
import { LockIcon } from "./ui";

/** Mobile view (below md): one section per day, sessions in period order. */
export function DayList({
  blocks,
  standard = null,
  isLocked = () => false,
}: {
  blocks: GridBlock[];
  /** The usual term; theory sessions outside it get a week label ("T12–16"). */
  standard?: number[] | null;
  isLocked?: (block: GridBlock) => boolean;
}) {
  return (
    <div className="space-y-4">
      {usedDays(blocks).map((day) => (
        <section key={day} aria-label={DAY_LONG[day]}>
          <h4 className="mb-2 text-sm font-semibold text-ctp-subtext">{DAY_LONG[day]}</h4>
          <ul className="space-y-2">
            {blocks
              .filter((b) => b.day === day)
              .map((b, i) => (
                <li key={i} className="course-block flex gap-3 rounded-xl p-3" style={courseColor(b.colorIndex)}>
                  <div className="w-16 shrink-0 text-sm font-semibold tabular-nums">
                    Tiết {b.startPeriod}
                    {b.endPeriod > b.startPeriod && `–${b.endPeriod}`}
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                      {b.courseCode} <span className="font-mono font-normal text-ctp-text/90">{b.groupId}</span>
                      {b.kind === "lab" && <span className="rounded bg-ctp-crust/60 px-1.5 text-xs font-bold">TN</span>}
                      {isLocked(b) && (
                        <span className="inline-flex items-center gap-1 rounded bg-ctp-crust/60 px-1.5 text-xs font-bold">
                          <LockIcon className="size-3" />
                          Đã khoá
                        </span>
                      )}
                    </p>
                    <p className="text-ctp-text/90">
                      {b.room} · {campusLabel(b.campus)}
                      {weekLabel(b, standard) && <span className="font-semibold"> · {weekLabel(b, standard)}</span>}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
