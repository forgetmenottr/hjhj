import { useId, type ReactNode } from "react";
import type { WeekFilter } from "../lib/view/grid";

/**
 * "Tuần: Tất cả · 1 · 2 · …" chips (a scrollable row on phones). Weeks without
 * a class look disabled and say "Không có lớp", but can still be chosen: the
 * view then shows that the week is empty.
 */
export function WeekSelector({ weeks, value, onChange }: { weeks: number[]; value: WeekFilter; onChange: (week: WeekFilter) => void }) {
  const labelId = useId();
  const last = Math.max(0, ...weeks, value === "all" ? 0 : value);
  const all = Array.from({ length: last }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="shrink-0 text-sm font-semibold">
        Tuần:
      </span>
      <div role="group" aria-labelledby={labelId} className="-mr-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 pr-4 pl-0.5 md:mr-0 md:flex-wrap md:pr-0">
        <Chip pressed={value === "all"} onClick={() => onChange("all")} className="px-3">
          Tất cả
        </Chip>
        {all.map((week) => {
          const hasClass = weeks.includes(week);
          return (
            <Chip
              key={week}
              pressed={value === week}
              muted={!hasClass}
              label={hasClass ? `Tuần ${week}` : `Tuần ${week} (không có lớp)`}
              title={hasClass ? `Tuần ${week}` : "Không có lớp"}
              onClick={() => onChange(week)}
            >
              {week}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  pressed,
  muted = false,
  label,
  title,
  onClick,
  className = "",
  children,
}: {
  pressed: boolean;
  muted?: boolean;
  /** Accessible name when the visible text is just the week number. */
  label?: string;
  title?: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  const look = pressed
    ? "bg-ctp-mauve text-ctp-crust"
    : muted
      ? "border border-dashed border-ctp-overlay1 text-ctp-subtext hover:bg-ctp-surface0"
      : "bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={`min-h-11 min-w-11 shrink-0 rounded-lg text-sm font-semibold tabular-nums transition-colors ${look} ${className}`}
    >
      {children}
    </button>
  );
}
