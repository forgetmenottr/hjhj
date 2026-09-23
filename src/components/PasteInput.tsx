import { useId, useRef, useState } from "react";
import type { ParsedPaste } from "../app/pastes";
import type { PasteNotice } from "../app/state";
import { Badge, Button, Card, CheckIcon, CloseIcon, InfoIcon, PasteAge, PlusIcon } from "./ui";

/** Step 1: paste box, instructions and the list of added courses. */
export function PasteInput({
  courses,
  notice,
  now,
  onAdd,
  onRemove,
}: {
  courses: ParsedPaste[];
  notice: PasteNotice | null;
  /** Clock of the render, for the "Dán … trước" line. */
  now: number;
  /** Returns true if at least one course was found (the box is then cleared). */
  onAdd: (text: string) => boolean;
  onRemove: (code: string) => void;
}) {
  const [text, setText] = useState("");
  const inputId = useId();
  const helpId = useId();

  const box = useRef<HTMLTextAreaElement>(null);

  // After a successful add the box is empty and "Thêm môn" becomes disabled,
  // which would drop keyboard focus to <body>; put it back in the box, ready
  // for the next course.
  const add = () => {
    if (!onAdd(text)) return;
    setText("");
    box.current?.focus();
  };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">Dán dữ liệu môn học</h2>
        <ol id={helpId} className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ctp-subtext">
          <li>Mở trang đăng ký môn học và tìm môn cần đăng ký.</li>
          <li>
            Bôi đen và copy <strong className="text-ctp-text">cả khối</strong>, bắt đầu từ dòng <code className="rounded bg-ctp-surface0 px-1 text-ctp-text">STT</code> đến hết danh sách nhóm lớp.
          </li>
          <li>Dán vào ô bên dưới rồi bấm “Thêm môn”. Làm lại cho từng môn (hoặc dán nhiều môn cùng lúc).</li>
        </ol>

        <label htmlFor={inputId} className="mt-4 block text-sm font-medium">
          Nội dung đã copy
        </label>
        <textarea
          ref={box}
          id={inputId}
          aria-describedby={helpId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={"STT\tMã MH\tTên MH\t…\n1\tCO2007\tKiến trúc máy tính\t4.0\nCO2007 - Kiến trúc máy tính\n…"}
          className="mt-1 w-full resize-y rounded-xl border border-ctp-overlay1 bg-ctp-base p-3 font-mono text-xs text-ctp-text placeholder:text-ctp-subtext focus:border-ctp-mauve"
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" onClick={add} disabled={text.trim() === ""} className="w-full sm:w-auto">
            <PlusIcon className="size-4" />
            Thêm môn
          </Button>
        </div>
        <NoticeLine notice={notice} />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">
          Môn đã thêm <span className="text-ctp-subtext">({courses.length})</span>
        </h2>
        {courses.length === 0 ? (
          <p className="mt-3 flex gap-2 rounded-xl border border-dashed border-ctp-surface1 p-4 text-sm text-ctp-subtext">
            <InfoIcon className="size-5 shrink-0" />
            Chưa có môn nào. Dán dữ liệu của môn đầu tiên ở ô phía trên.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {courses.map((p) => (
              <CourseChip key={p.code} paste={p} now={now} onRemove={() => onRemove(p.code)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CourseChip({ paste, now, onRemove }: { paste: ParsedPaste; now: number; onRemove: () => void }) {
  const groups = paste.course?.groups.length ?? 0;
  return (
    <li className="flex items-center gap-3 rounded-xl bg-ctp-surface0/60 py-2 pr-2 pl-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-semibold">{paste.code}</span>
          <span className="text-ctp-subtext"> · {paste.course?.name ?? "Không đọc được"}</span>
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge tone={groups > 0 ? "neutral" : "red"}>{groups} nhóm</Badge>
          {paste.warnings.length > 0 && <Badge tone="yellow">{paste.warnings.length} cảnh báo</Badge>}
          <PasteAge pastedAt={paste.pastedAt} now={now} />
        </div>
      </div>
      <Button variant="ghost" onClick={onRemove} aria-label={`Xoá ${paste.code}`} className="px-2.5!">
        <CloseIcon />
      </Button>
    </li>
  );
}

/** "Đã thêm …" / "Đã thay …" / nothing found. Announced to screen readers. */
function NoticeLine({ notice }: { notice: PasteNotice | null }) {
  let content = null;
  if (notice?.empty) {
    content = (
      <p className="flex gap-2 text-ctp-red">
        <InfoIcon className="size-5 shrink-0" />
        Không tìm thấy môn học nào trong nội dung vừa dán. Hãy copy cả khối bắt đầu từ dòng “STT”.
      </p>
    );
  } else if (notice) {
    content = (
      <div className="space-y-1">
        {notice.added.length > 0 && (
          <p className="flex gap-2 text-ctp-green">
            <CheckIcon className="size-5 shrink-0" />
            Đã thêm {notice.added.join(", ")}.
          </p>
        )}
        {notice.replaced.length > 0 && (
          <p className="flex gap-2 text-ctp-yellow">
            <InfoIcon className="size-5 shrink-0" />
            Đã thay {notice.replaced.join(", ")} bằng dữ liệu vừa dán (thay cho bản cũ).
          </p>
        )}
      </div>
    );
  }
  return (
    <div role="status" aria-live="polite" className="mt-3 text-sm empty:hidden">
      {content}
    </div>
  );
}
