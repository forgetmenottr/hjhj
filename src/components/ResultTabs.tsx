import { useId, useRef, type KeyboardEvent } from "react";
import type { SolveOutcome } from "../app/state";
import type { Schedule } from "../lib/solver";
import { toGridBlocks, type GridBlock, type WeekFilter } from "../lib/view/grid";
import { relaxedViolations, scheduleLabel } from "../lib/view/summary";
import { PickList, type PickActions } from "./PickList";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { TimetableSection } from "./TimetableSection";
import { AlertIcon, Card } from "./ui";

interface Props extends PickActions {
  outcome: SolveOutcome;
  /** Selected schedule (lives in the reducer so a re-run can reset it to the first one). */
  selected: number;
  onSelect: (index: number) => void;
  courseNames: Record<string, string>;
  locked: Record<string, string>;
  autoLocked: string[];
  /** Week shown in the timetable (shared with step 5 and the PNG export). */
  week: WeekFilter;
  onWeek: (week: WeekFilter) => void;
  standard: number[] | null;
}

/**
 * "Lịch 1 · 87 điểm" … tabs and the selected schedule. A schedule that breaks
 * relaxed requirements is labelled "Lịch N · ⚠ K yêu cầu" instead of its score.
 */
export function ResultTabs({ outcome, selected, onSelect, courseNames, locked, autoLocked, week, onWeek, standard, onToggleLock, onMarkFull }: Props) {
  const { schedules, stats, relaxed } = outcome.result;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  if (schedules.length === 0) return null;
  const index = Math.min(selected, schedules.length - 1);
  const current = schedules[index];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (index + delta + schedules.length) % schedules.length;
    onSelect(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Các lịch tìm được" onKeyDown={onKeyDown} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {schedules.map((s, i) => {
          const warn = relaxedViolations(s, relaxed).length > 0;
          const active = i === index;
          return (
            <button
              key={i}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              id={`${baseId}-tab-${i}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${baseId}-panel`}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(i)}
              className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
                active
                  ? warn
                    ? "bg-ctp-peach text-ctp-crust"
                    : "bg-ctp-mauve text-ctp-crust"
                  : warn
                    ? "bg-ctp-surface0 text-ctp-peach hover:bg-ctp-surface1"
                    : "bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1"
              }`}
            >
              {scheduleLabel(s, i, relaxed)}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${index}`} className="space-y-4">
        <ScheduleView
          schedule={current}
          relaxed={relaxed}
          week={week}
          onWeek={onWeek}
          standard={standard}
          courseNames={courseNames}
          locked={locked}
          autoLocked={autoLocked}
          onToggleLock={onToggleLock}
          onMarkFull={onMarkFull}
        />
        <p className="text-xs text-ctp-subtext">
          Đã duyệt {stats.nodes.toLocaleString("vi-VN")} nút · bộ giải {Math.round(stats.ms)} ms · tổng {Math.round(outcome.elapsedMs)} ms
        </p>
        {stats.truncated && (
          <p className="flex gap-2 text-sm text-ctp-yellow">
            <AlertIcon className="size-5 shrink-0" />
            Bộ xếp lịch dừng sớm vì chạm giới hạn tìm kiếm — có thể còn lịch tốt hơn chưa được xét.
          </p>
        )}
      </div>
    </div>
  );
}

function ScheduleView({
  schedule,
  relaxed,
  week,
  onWeek,
  standard,
  courseNames,
  locked,
  autoLocked,
  onToggleLock,
  onMarkFull,
}: PickActions & {
  schedule: Schedule;
  relaxed: string[];
  week: WeekFilter;
  onWeek: (week: WeekFilter) => void;
  standard: number[] | null;
  courseNames: Record<string, string>;
  locked: Record<string, string>;
  autoLocked: string[];
}) {
  const blocks = toGridBlocks(schedule);
  const isLocked = (b: GridBlock) => locked[b.courseCode] === b.groupId;
  const broken = relaxedViolations(schedule, relaxed);

  return (
    <>
      <PickList
        schedule={schedule}
        relaxed={relaxed}
        courseNames={courseNames}
        locked={locked}
        autoLocked={autoLocked}
        onToggleLock={onToggleLock}
        onMarkFull={onMarkFull}
      />

      <TimetableSection blocks={blocks} week={week} onWeek={onWeek} standard={standard} isLocked={isLocked} />

      <Card>
        <h3 className="font-semibold">
          Điểm: {schedule.score}/100 <span className="text-sm font-normal text-ctp-subtext">(càng ít điểm phạt càng tốt)</span>
        </h3>
        {broken.length > 0 && (
          <p className="mt-1 flex gap-2 text-sm text-ctp-peach">
            <AlertIcon className="size-5 shrink-0" />
            Điểm chưa tính các yêu cầu bị nới: lịch này vi phạm {broken.length} yêu cầu bắt buộc (xem bên dưới).
          </p>
        )}
        <div className="mt-2">
          <ScoreBreakdown schedule={schedule} relaxed={relaxed} />
        </div>
      </Card>
    </>
  );
}
