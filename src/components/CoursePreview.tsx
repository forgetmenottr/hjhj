import { useId, useState } from "react";
import { parseWarningText } from "../app/messages";
import type { ParsedPaste } from "../app/pastes";
import type { Group } from "../lib/parser";
import { formatCredits, formatSession, isFull, programBadge } from "../lib/view/format";
import { courseColor } from "./courseColor";
import { AlertIcon, Badge, BanIcon, ChevronIcon, LockIcon, PasteAge, ToggleButton, UnlockIcon } from "./ui";

/** Lock (true) or unlock (false) a group. */
type ToggleLock = (courseCode: string, groupId: string, lock: boolean) => void;

/** Step 2: one collapsible card per course with its groups and parse warnings. */
export function CoursePreview({
  courses,
  locked,
  excluded,
  now,
  onToggleLock,
}: {
  courses: ParsedPaste[];
  locked: Record<string, string>;
  excluded: string[];
  /** Clock of the render, for the "Dán … trước" line (never read inside the helpers). */
  now: number;
  onToggleLock: ToggleLock;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ctp-subtext">
        Kiểm tra lại dữ liệu đã đọc được. Mở từng môn để xem nhóm lớp và lịch học. Nếu đã biết sẽ học nhóm nào, bấm “Chọn nhóm này” để
        khoá nhóm đó khi xếp lịch.
      </p>
      {courses.map((paste, index) => (
        <CourseCard
          key={paste.code}
          paste={paste}
          colorIndex={index}
          defaultOpen={index === 0}
          lockedId={locked[paste.code]}
          excluded={excluded}
          now={now}
          onToggleLock={onToggleLock}
        />
      ))}
    </div>
  );
}

function CourseCard({
  paste,
  colorIndex,
  defaultOpen,
  lockedId,
  excluded,
  now,
  onToggleLock,
}: {
  paste: ParsedPaste;
  colorIndex: number;
  defaultOpen: boolean;
  lockedId: string | undefined;
  excluded: string[];
  now: number;
  onToggleLock: ToggleLock;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const course = paste.course;
  const groups = course?.groups ?? [];

  return (
    <section className="overflow-hidden rounded-2xl border border-ctp-surface0 bg-ctp-mantle" style={courseColor(colorIndex)}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-3 p-4 text-left hover:bg-ctp-surface0/40"
        >
          <span className="course-dot size-3 shrink-0 rounded-full" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {paste.code} · {course?.name ?? "Không đọc được"}
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              {course && <Badge>{formatCredits(course.credits)}</Badge>}
              <Badge tone={groups.length > 0 ? "neutral" : "red"}>{groups.length} nhóm</Badge>
              {paste.warnings.length > 0 && <Badge tone="yellow">{paste.warnings.length} cảnh báo</Badge>}
              <PasteAge pastedAt={paste.pastedAt} now={now} />
              {lockedId !== undefined && (
                <Badge tone="mauve">
                  <LockIcon className="size-3.5" />
                  Đã khoá {lockedId}
                </Badge>
              )}
            </span>
          </span>
          <ChevronIcon className={`size-5 shrink-0 text-ctp-subtext transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </h3>

      <div id={bodyId} hidden={!open} className="border-t border-ctp-surface0 px-4 pb-4">
        {groups.length === 0 && (
          <p className="mt-3 text-sm text-ctp-red">Không tìm thấy nhóm lớp nào — môn này sẽ bị bỏ qua khi xếp lịch.</p>
        )}
        {groups.length > 0 && (
          <ul className="divide-y divide-ctp-surface0">
            {groups.map((group) => (
              <GroupRow
                key={group.id}
                courseCode={paste.code}
                group={group}
                isLocked={lockedId === group.id}
                isExcluded={excluded.includes(`${paste.code}:${group.id}`)}
                onToggleLock={onToggleLock}
              />
            ))}
          </ul>
        )}
        {paste.warnings.length > 0 && (
          <div className="mt-3 rounded-xl bg-ctp-yellow/10 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-ctp-yellow">
              <AlertIcon className="size-4" /> Cảnh báo khi đọc dữ liệu
            </p>
            <ul className="mt-2 space-y-2 text-sm">
              {paste.warnings.map((w, i) => (
                <li key={i}>
                  <span className="font-semibold">Dòng {w.line}:</span> {parseWarningText(w)}
                  <code className="mt-0.5 block truncate rounded bg-ctp-base px-2 py-1 text-xs text-ctp-subtext">{w.text}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/** One group: id, DK/Sĩ số (+ "Đầy"), language, lock state, lecturers, sessions. */
function GroupRow({
  courseCode,
  group,
  isLocked,
  isExcluded,
  onToggleLock,
}: {
  courseCode: string;
  group: Group;
  isLocked: boolean;
  isExcluded: boolean;
  onToggleLock: ToggleLock;
}) {
  const full = isFull(group);
  return (
    <li className="py-3" data-group={group.id}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono font-semibold">{group.id}</span>
        <Badge tone="mauve">{programBadge(group)}</Badge>
        <span className="text-sm">
          <span className="text-ctp-subtext">DK/Sĩ số </span>
          {group.registered}/{group.capacity}
        </span>
        {full && <Badge tone="red">Đầy</Badge>}
        <Badge tone={group.language === "TA" ? "blue" : "neutral"}>{group.language || "?"}</Badge>
        {isLocked && (
          <Badge tone="mauve">
            <LockIcon className="size-3.5" />
            Đã khoá
          </Badge>
        )}
        {isExcluded && (
          <Badge tone="red">
            <BanIcon className="size-3.5" />
            Đã loại
          </Badge>
        )}
        <ToggleButton
          pressed={isLocked}
          onClick={() => onToggleLock(courseCode, group.id, !isLocked)}
          aria-label={`Chọn nhóm này (${courseCode} ${group.id})`}
          className="ml-auto px-3"
        >
          {isLocked ? <LockIcon className="size-4" /> : <UnlockIcon className="size-4" />}
          Chọn nhóm này
        </ToggleButton>
      </div>
      <p className="mt-1 text-sm text-ctp-subtext">
        GV: <span className="text-ctp-text">{group.lecturer ?? "—"}</span>
        {group.practiceGroup !== null && (
          <>
            {" "}
            · GV TN: <span className="text-ctp-text">{group.labLecturer ?? "—"}</span>
          </>
        )}
      </p>
      <ul className="mt-1 space-y-0.5 font-mono text-xs text-ctp-text">
        {group.sessions.map((s, i) => (
          <li key={i}>{formatSession(s)}</li>
        ))}
      </ul>
    </li>
  );
}
