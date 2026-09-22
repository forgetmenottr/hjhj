import { blocksForWeek, weeksWithClasses, type GridBlock, type WeekFilter } from "../lib/view/grid";
import { DayList } from "./DayList";
import { TimetableGrid } from "./TimetableGrid";
import { InfoIcon } from "./ui";
import { WeekSelector } from "./WeekSelector";

/**
 * The week selector, then the weekly grid (md and up, and in print) or the day
 * list (phones). A week without classes shows an empty state instead.
 */
export function TimetableSection({
  blocks,
  week,
  onWeek,
  standard,
  isLocked,
}: {
  /** All-weeks blocks of the schedule. */
  blocks: GridBlock[];
  week: WeekFilter;
  onWeek: (week: WeekFilter) => void;
  standard: number[] | null;
  isLocked: (block: GridBlock) => boolean;
}) {
  const shown = blocksForWeek(blocks, week);
  return (
    <section aria-label="Thời khoá biểu" className="space-y-2">
      <div className="print:hidden">
        <WeekSelector weeks={weeksWithClasses(blocks)} value={week} onChange={onWeek} />
      </div>
      <div aria-live="polite">
        {shown.length === 0 ? (
          <p className="flex items-center gap-2 rounded-2xl border border-dashed border-ctp-overlay1 p-6 text-sm text-ctp-subtext">
            <InfoIcon className="size-5 shrink-0" />
            Tuần này không có lớp
          </p>
        ) : (
          <p className="text-xs text-ctp-subtext">
            {week === "all"
              ? "Gộp tất cả các tuần. Buổi thí nghiệm (TN) và buổi chỉ học vài tuần (ví dụ T1–5) ghi rõ tuần học."
              : `Tuần ${week}: chỉ hiện các buổi có học trong tuần này.`}
          </p>
        )}
      </div>
      {shown.length > 0 && (
        <>
          <div className="hidden md:block print:block">
            {/* The grid keeps the all-weeks frame so days and rows do not jump between weeks. */}
            <TimetableGrid blocks={shown} frame={blocks} standard={standard} isLocked={isLocked} />
          </div>
          <div className="md:hidden print:hidden">
            <DayList blocks={shown} standard={standard} isLocked={isLocked} />
          </div>
        </>
      )}
    </section>
  );
}
