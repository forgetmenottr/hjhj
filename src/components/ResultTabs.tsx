import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { SolveOutcome } from "../app/state";
import type { Schedule } from "../lib/solver";
import { groupIdOf, isFull } from "../lib/view/format";
import { toGridBlocks } from "../lib/view/grid";
import { courseColor } from "./courseColor";
import { DayList } from "./DayList";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { TimetableGrid } from "./TimetableGrid";
import { AlertIcon, Badge, Card } from "./ui";

/**
 * "Lịch 1 · 87 điểm" … tabs and the selected schedule. Remount (via `key`)
 * for a new result so the selection starts at the first schedule.
 */
export function ResultTabs({ outcome, courseNames }: { outcome: SolveOutcome; courseNames: Record<string, string> }) {
  const { schedules, stats } = outcome.result;
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  if (schedules.length === 0) return null;
  const current = schedules[Math.min(selected, schedules.length - 1)];

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (e: KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = (selected + delta + schedules.length) % schedules.length;
    setSelected(next);
    tabs.current[next]?.focus();
  };

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Các lịch tìm được" onKeyDown={onKeyDown} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {schedules.map((s, i) => (
          <button
            key={i}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`${baseId}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === selected}
            aria-controls={`${baseId}-panel`}
            tabIndex={i === selected ? 0 : -1}
            onClick={() => setSelected(i)}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition-colors ${
              i === selected ? "bg-ctp-mauve text-ctp-crust" : "bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1"
            }`}
          >
            Lịch {i + 1} · {s.score} điểm
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${selected}`} className="space-y-4">
        <ScheduleView schedule={current} courseNames={courseNames} />
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

function ScheduleView({ schedule, courseNames }: { schedule: Schedule; courseNames: Record<string, string> }) {
  const blocks = toGridBlocks(schedule);
  return (
    <>
      <Card>
        <h3 className="font-semibold">Nhóm đã chọn</h3>
        <ul className="mt-3 space-y-3">
          {schedule.picks.map((pick, i) => {
            const group = pick.group.group;
            return (
              <li key={pick.courseCode} className="flex gap-3" style={courseColor(i)}>
                <span className="course-dot mt-1.5 size-3 shrink-0 rounded-full" aria-hidden="true" />
                <div className="min-w-0 text-sm">
                  <p className="truncate">
                    <span className="font-semibold">{pick.courseCode}</span>
                    <span className="text-ctp-subtext"> · {courseNames[pick.courseCode] ?? ""}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-bold">{group.id}</span>
                    <span className="text-ctp-subtext">
                      {group.registered}/{group.capacity}
                    </span>
                    {isFull(group) && <Badge tone="red">Đầy</Badge>}
                    <Badge tone={group.language === "TA" ? "blue" : "neutral"}>{group.language}</Badge>
                  </p>
                  {pick.alternatives.length > 0 && (
                    <p className="mt-0.5 text-ctp-subtext">hoặc {pick.alternatives.map(groupIdOf).join(", ")}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <section aria-label="Thời khoá biểu">
        <p className="mb-2 text-xs text-ctp-subtext">Gộp tất cả các tuần; buổi thí nghiệm (TN) ghi rõ tuần học.</p>
        <div className="hidden md:block">
          <TimetableGrid blocks={blocks} />
        </div>
        <div className="md:hidden">
          <DayList blocks={blocks} />
        </div>
      </section>

      <Card>
        <h3 className="font-semibold">
          Điểm: {schedule.score}/100 <span className="text-sm font-normal text-ctp-subtext">(càng ít điểm phạt càng tốt)</span>
        </h3>
        <div className="mt-2">
          <ScoreBreakdown schedule={schedule} />
        </div>
      </Card>
    </>
  );
}
