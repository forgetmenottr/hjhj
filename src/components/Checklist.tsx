import type { Schedule } from "../lib/solver";
import { checklistText, scheduleCredits } from "../lib/view/checklist";
import { formatCredits, groupIdOf, programBadge } from "../lib/view/format";
import { courseColor } from "./courseColor";
import { Badge, Button, Card, CheckIcon, CopyIcon } from "./ui";

/**
 * Step 5: one row per course of the chosen schedule — the group id to type
 * into the registration page, a copy button, "Đã đăng ký" (a user lock) and
 * "Đã đầy — tìm nhóm khác".
 */
export function Checklist({
  schedule,
  courseNames,
  credits,
  registered,
  onRegister,
  onMarkFull,
  onCopy,
}: {
  schedule: Schedule;
  courseNames: Record<string, string>;
  credits: Record<string, number | null>;
  registered: string[];
  onRegister: (key: string, done: boolean) => void;
  onMarkFull: (key: string) => void;
  onCopy: (text: string) => void;
}) {
  const total = schedule.picks.length;
  const done = schedule.picks.filter((p) => registered.includes(p.group.key)).length;
  const { total: creditSum, unknown } = scheduleCredits(schedule, credits);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Danh sách đăng ký</h2>
          <p className="mt-1 text-sm" aria-live="polite">
            <span className="font-semibold">
              Đã đăng ký {done}/{total} môn
            </span>
            <span className="text-ctp-subtext">
              {" "}
              · Tổng {creditSum}
              {unknown.length > 0 && " + ?"} TC
            </span>
          </p>
        </div>
        <Button variant="secondary" onClick={() => onCopy(checklistText(schedule))} className="print:hidden">
          <CopyIcon className="size-4" />
          Sao chép tất cả
        </Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ctp-surface0 print:hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-ctp-green transition-[width]" style={{ width: `${total === 0 ? 0 : (100 * done) / total}%` }} />
      </div>

      <ul className="mt-4 space-y-3">
        {schedule.picks.map((pick, i) => {
          const id = pick.group.group.id;
          const key = pick.group.key;
          const checked = registered.includes(key);
          const context = ` (${pick.courseCode} ${id})`;
          return (
            <li
              key={pick.courseCode}
              data-register={key}
              style={courseColor(i)}
              className={`rounded-xl border p-3 break-inside-avoid ${checked ? "border-ctp-green bg-ctp-green/10" : "border-ctp-surface1"}`}
            >
              <p className="flex items-center gap-2 text-sm">
                <span className="course-dot size-3 shrink-0 rounded-full" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{pick.courseCode}</span>
                  <span className="text-ctp-subtext">
                    {" "}
                    · {courseNames[pick.courseCode] ?? ""} · {formatCredits(credits[pick.courseCode] ?? null)}
                  </span>
                </span>
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-mono text-2xl font-bold tracking-wide">{id}</span>
                <Badge tone="mauve">{programBadge(pick.group.group)}</Badge>
                <Button variant="ghost" onClick={() => onCopy(id)} aria-label={`Sao chép ${id}`} className="px-3 print:hidden">
                  <CopyIcon className="size-4" />
                  Sao chép
                </Button>
              </div>
              {pick.alternatives.length > 0 && (
                <p className="mt-0.5 text-sm text-ctp-subtext">hoặc {pick.alternatives.map(groupIdOf).join(", ")}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-ctp-surface0 px-3 text-sm font-semibold has-checked:bg-ctp-green has-checked:text-ctp-crust has-focus-visible:outline-2 has-focus-visible:outline-ctp-lavender">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onRegister(key, e.target.checked)}
                    aria-label={`Đã đăng ký${context}`}
                    className="size-5"
                  />
                  {checked && <CheckIcon className="size-4" />}
                  Đã đăng ký
                </label>
                <Button variant="secondary" onClick={() => onMarkFull(key)} aria-label={`Đã đầy — tìm nhóm khác${context}`} className="px-3 print:hidden">
                  Đã đầy — tìm nhóm khác
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
