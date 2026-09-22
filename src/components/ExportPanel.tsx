import { useId } from "react";
import { mondayOf } from "../lib/export/ics";
import { Button, Card, DownloadIcon, PrintIcon } from "./ui";

/** "2026-09-07" → "07/09/2026". */
function vnDate(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Step 5: calendar file (needs the first Monday), PNG image and print. */
export function ExportPanel({
  semesterStart,
  weekNote,
  onSemesterStart,
  onIcs,
  onPng,
  onPrint,
}: {
  semesterStart: string | null;
  /** "Tất cả tuần" / "Tuần 6": what the image will show. */
  weekNote: string;
  onSemesterStart: (date: string | null) => void;
  onIcs: () => void;
  onPng: () => void;
  onPrint: () => void;
}) {
  const dateId = useId();
  const hintId = useId();
  const monday = semesterStart ? mondayOf(semesterStart) : null;
  const hint = !semesterStart
    ? "Nhập ngày thứ Hai của tuần 1 để tải lịch (.ics) cho Google Calendar hoặc ứng dụng Lịch trên điện thoại."
    : monday !== semesterStart && monday
      ? `Ngày này không phải thứ Hai; tuần 1 được tính từ thứ Hai ${vnDate(monday)}.`
      : `Tuần 1 bắt đầu thứ Hai ${vnDate(semesterStart)}.`;

  return (
    <Card className="print:hidden">
      <h2 className="text-lg font-semibold">Xuất lịch</h2>
      <div className="mt-3">
        <label htmlFor={dateId} className="text-sm font-medium">
          Ngày thứ Hai của tuần 1
        </label>
        <input
          id={dateId}
          type="date"
          value={semesterStart ?? ""}
          aria-describedby={hintId}
          onChange={(e) => onSemesterStart(e.target.value || null)}
          // Chrome focuses a field inside the date input's shadow tree, so the input matches only
          // :focus-within (not :focus / :focus-visible); draw the focus ring on that.
          className="mt-1 block min-h-11 w-full max-w-60 rounded-lg border border-ctp-overlay1 bg-ctp-base px-3 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ctp-lavender"
        />
        <p id={hintId} className="mt-1 text-sm text-ctp-subtext">
          {hint}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onIcs} disabled={!monday} aria-describedby={hintId}>
          <DownloadIcon className="size-4" />
          Tải lịch (.ics)
        </Button>
        <Button variant="secondary" onClick={onPng}>
          <DownloadIcon className="size-4" />
          Tải ảnh (.png)
        </Button>
        <Button variant="secondary" onClick={onPrint}>
          <PrintIcon className="size-4" />
          In
        </Button>
      </div>
      <p className="mt-2 text-xs text-ctp-subtext">Ảnh và bản in theo tuần đang chọn ở thời khoá biểu: {weekNote}.</p>
    </Card>
  );
}
