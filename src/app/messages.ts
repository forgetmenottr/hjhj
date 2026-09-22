import type { ParseWarning, ParseWarningCode } from "../lib/parser";
import type { SolverDiagnostic, SolverDiagnosticCode } from "../lib/solver";
import type { ConflictSummaryItem, TimeWarning, TimeWarningCode } from "../lib/timing";
import { DAY_LONG, formatRanges, itemLabel } from "../lib/view/format";

// Vietnamese text for every warning / diagnostic code of the libraries. A
// template returns null when a parameter is missing or has the wrong type; the
// caller then shows the library's English message instead, as it does for an
// unknown code.

type Params = Record<string, unknown>;
type Template = (p: Params) => string | null;

const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const strings = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
const numbers = (value: unknown): number[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === "number") ? (value as number[]) : null;

/** "CO2007:A01_A01" → "CO2007 A01_A01". */
const key = (value: unknown): string | null => str(value)?.replace(":", " ") ?? null;
/** ["campuses", "language"] → "Cơ sở, Ngôn ngữ". */
const labels = (value: unknown): string | null => strings(value)?.map(itemLabel).join(", ") ?? null;

/** Fills a template only when every value is present. */
function fill(values: (string | number | null)[], build: (...v: (string | number)[]) => string): string | null {
  return values.some((v) => v === null) ? null : build(...(values as (string | number)[]));
}

export const PARSE_TEMPLATES: Record<ParseWarningCode, Template> = {
  "internal-error": () => "Lỗi nội bộ khi đọc dòng này; đã bỏ qua dòng.",
  "unrecognized-line": () => "Không nhận ra dòng này; đã bỏ qua.",
  "group-before-course": () => "Dòng nhóm lớp nằm trước tên môn học; đã bỏ qua.",
  "invalid-group-id": (p) => fill([str(p.id)], (id) => `Mã nhóm “${id}” không hợp lệ; đã bỏ qua.`),
  "missing-registered-capacity": () => "Dòng nhóm lớp thiếu số đăng ký / sĩ số (ví dụ 34/40); đã bỏ qua.",
  "missing-language": () => "Dòng nhóm lớp thiếu ngôn ngữ (V/TA).",
  "session-without-group": () => "Dòng lịch học không nằm dưới nhóm lớp hợp lệ nào; đã bỏ qua.",
  "session-no-day": () => "Dòng lịch học thiếu thứ; đã bỏ qua.",
  "session-no-room": () => "Dòng lịch học thiếu phòng học (ví dụ C5-202); đã bỏ qua.",
  "session-no-weeks": () => "Dòng lịch học thiếu chuỗi tuần học; đã bỏ qua.",
  "session-no-periods": () => "Dòng lịch học không có tiết nào; đã bỏ qua.",
  "period-column-count": (p) =>
    fill([num(p.found), num(p.expected)], (found, expected) => `Cột tiết có ${found} ô thay vì ${expected} ô.`),
  "period-misplaced": () => "Có số tiết không khớp với vị trí cột.",
  "week-digit-mismatch": (p) =>
    fill([numbers(p.weeks)?.join(", ") ?? null], (weeks) => `Chữ số trong chuỗi tuần không khớp tuần ${weeks}; đã tính theo vị trí.`),
  "unknown-campus": (p) => {
    const campus = str(p.campus);
    if (campus === null) return null;
    return campus === "" ? "Thiếu cơ sở (1 hoặc 2)." : `Cơ sở “${campus}” không rõ (cần 1 hoặc 2).`;
  },
  "no-teaching-week": () => "Chuỗi tuần học không có tuần nào.",
};

export const TIME_TEMPLATES: Record<TimeWarningCode, Template> = {
  "duplicate-course": () => "Môn này có hai bản; dùng bản dán sau.",
  "duplicate-group": () => "Nhóm này xuất hiện hai lần; dùng bản sau.",
  "slots-out-of-range": (p) =>
    fill([num(p.session), num(p.count), num(p.maxWeek), num(p.periods)], (session, count, maxWeek, periods) =>
      `Buổi ${session}: bỏ ${count} tiết nằm ngoài tuần 1–${maxWeek} hoặc tiết 1–${periods}.`,
    ),
  "internal-overlap": (p) =>
    fill([num(p.session), num(p.other)], (session, other) => `Buổi ${session} trùng giờ với buổi ${other} của chính nhóm này.`),
  "group-no-sessions": () => "Nhóm không có buổi học nào (có thể do dòng lịch học bị bỏ qua), nên sẽ không chiếm giờ nào khi xếp lịch.",
};

/** "Thứ 2 tiết 2–3 (tuần 1–7, 9–16)"; null unless every item is well formed. */
function overlapText(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts = (value as Partial<ConflictSummaryItem>[]).map((item) => {
    const day = num(item.day);
    const periods = numbers(item.periods);
    const weeks = numbers(item.weeks);
    const dayName = day === null ? undefined : DAY_LONG[day as keyof typeof DAY_LONG];
    return dayName && periods && weeks ? `${dayName} tiết ${formatRanges(periods)} (tuần ${formatRanges(weeks)})` : null;
  });
  return parts.every((part) => part !== null) ? parts.join("; ") : null;
}

export const SOLVER_TEMPLATES: Record<SolverDiagnosticCode, Template> = {
  "no-courses": () => "Chưa có môn nào để xếp lịch.",
  "dropped-conflicting": (p) => fill([num(p.count)], (count) => `Bước kiểm tra cuối đã bỏ ${count} lịch bị trùng giờ (lỗi nội bộ).`),
  "course-blocked": (p) =>
    fill([str(p.course), labels(p.constraints)], (course, names) => `${course}: không nhóm nào đáp ứng yêu cầu bắt buộc “${names}”.`),
  "course-blocked-combined": (p) =>
    fill([str(p.course), labels(p.constraints)], (course, names) => `${course}: không nhóm nào đáp ứng cùng lúc các yêu cầu bắt buộc (${names}).`),
  "no-combination-required": (p) =>
    fill([labels(p.constraints)], (names) => `Không có cách chọn nhóm nào vừa không trùng giờ vừa đáp ứng mọi yêu cầu bắt buộc (${names}).`),
  relaxed: (p) =>
    fill([labels(p.constraints), num(p.weight)], (names, weight) => `Đã tạm chuyển thành ưu tiên (trọng số ${weight}): ${names}.`),
  "course-no-groups": (p) => fill([str(p.course)], (course) => `${course}: môn này không có nhóm lớp nào.`),
  "all-excluded": (p) => fill([str(p.course), num(p.count)], (course, count) => `${course}: cả ${count} nhóm đều đã bị loại.`),
  "locked-excluded": (p) => fill([str(p.course), key(p.key)], (course, group) => `${course}: nhóm đã khoá ${group} lại đang bị loại.`),
  "locked-missing": (p) => fill([str(p.course), key(p.key)], (course, group) => `${course}: nhóm đã khoá ${group} không có trong dữ liệu đã dán.`),
  "locked-overlap": (p) =>
    fill([key(p.a), key(p.b), overlapText(p.overlap)], (a, b, when) => `Hai nhóm đã khoá ${a} và ${b} trùng giờ: ${when}.`),
  "conflicts-with-locked": (p) =>
    fill([str(p.course), strings(p.locked)?.map((k) => k.replace(":", " ")).join(", ") ?? null], (course, locked) =>
      `${course}: mọi nhóm đều trùng giờ với nhóm đã khoá ${locked}.`,
    ),
  "no-combination": (p) =>
    typeof p.afterRelax === "boolean"
      ? `Không có cách chọn nhóm nào mà không trùng giờ${p.afterRelax ? ", kể cả khi đã nới các yêu cầu bắt buộc" : ""}.`
      : null,
  truncated: (p) =>
    fill([num(p.nodes), num(p.maxNodes)], (nodes, max) =>
      `Bộ xếp lịch dừng sau ${nodes.toLocaleString("vi-VN")} nút (giới hạn ${max.toLocaleString("vi-VN")}); có thể còn lịch chưa được xét.`,
    ),
};

function translate(templates: Record<string, Template>, code: unknown, params: unknown, english: string): string {
  const template = typeof code === "string" && Object.hasOwn(templates, code) ? templates[code] : undefined;
  const values = params && typeof params === "object" ? (params as Params) : {};
  return template?.(values) ?? english;
}

/** Vietnamese text of a parse warning (English fallback). */
export function parseWarningText(w: Pick<ParseWarning, "code" | "params" | "message">): string {
  return translate(PARSE_TEMPLATES, w.code, w.params, w.message);
}

/** Vietnamese text of a mask warning (English fallback). */
export function timeWarningText(w: Pick<TimeWarning, "code" | "params" | "message">): string {
  return translate(TIME_TEMPLATES, w.code, w.params, w.message);
}

/** Vietnamese text of a solver diagnostic (English fallback). */
export function diagnosticText(d: SolverDiagnostic): string {
  return translate(SOLVER_TEMPLATES, d.code, d.params, d.message);
}
