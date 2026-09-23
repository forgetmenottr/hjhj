import { PROGRAM_CODES, programLabel, programOf, type Course, type Day, type Group, type Session } from "../parser";

/** Short day labels used across the UI. */
export const DAY_SHORT: Record<Day, string> = { 2: "T2", 3: "T3", 4: "T4", 5: "T5", 6: "T6", 7: "T7", 8: "CN" };
export const DAY_LONG: Record<Day, string> = {
  2: "Thứ 2",
  3: "Thứ 3",
  4: "Thứ 4",
  5: "Thứ 5",
  6: "Thứ 6",
  7: "Thứ 7",
  8: "Chủ nhật",
};
export const ALL_DAYS: Day[] = [2, 3, 4, 5, 6, 7, 8];

/** Names of the five steps of the app. */
export const STEP_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Dán dữ liệu",
  2: "Kiểm tra",
  3: "Yêu cầu",
  4: "Kết quả",
  5: "Đăng ký",
};

/** Vietnamese names of solver score items and constraints. */
export const ITEM_LABELS: Record<string, string> = {
  timeOfDay: "Buổi ưu tiên",
  fewerDays: "Ít ngày lên trường",
  compactDays: "Lịch gọn",
  noCampusSwitch: "Không đổi cơ sở trong ngày",
  avoidEarly: "Tránh tiết 1–2",
  programs: "Chương trình",
  campuses: "Cơ sở",
  daysOff: "Ngày nghỉ",
  partsOff: "Buổi nghỉ",
  language: "Ngôn ngữ",
  freeSeats: "Còn chỗ trống",
  avoidLecturers: "Tránh giảng viên",
};

export function itemLabel(item: string): string {
  return ITEM_LABELS[item] ?? item;
}

/** Sorted, de-duplicated runs of consecutive numbers: [2,3,4,8] → [[2,4],[8,8]]. */
export function contiguousRuns(numbers: number[]): [number, number][] {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const n of sorted) {
    const last = runs[runs.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs;
}

/** [2,3,4] → "2–4"; [2,3,5] → "2–3, 5". */
export function formatRanges(numbers: number[]): string {
  return contiguousRuns(numbers)
    .map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
    .join(", ");
}

/**
 * Compact week label for sessions outside the usual term: [1..5] → "T1–5",
 * [6,7,9,10,11] → "T6–7, 9–11", [13] → "T13" ("T" = tuần). Empty → "".
 */
export function formatWeeks(weeks: number[]): string {
  const ranges = formatRanges(weeks);
  return ranges === "" ? "" : `T${ranges}`;
}

/** 4 → "4 TC", 0 → "0 TC" (a real value, e.g. SK2001), null (no summary row) → "? TC". */
export function formatCredits(credits: number | null): string {
  return `${credits ?? "?"} TC`;
}

/** Lab weeks are listed one by one: [6,10,12,14] → "6,10,12,14". */
export function formatWeekList(weeks: number[]): string {
  return weeks.join(",");
}

export function campusLabel(campus: 1 | 2 | null): string {
  return campus === null ? "CS?" : `CS${campus}`;
}

/** "T2 · tiết 2–4 · A4-409 · CS1", plus " · TN tuần 6,10,12,14" for labs. */
export function formatSession(s: Session): string {
  const base = `${DAY_SHORT[s.day]} · tiết ${formatRanges(s.periods)} · ${s.room} · ${campusLabel(s.campus)}`;
  return s.kind === "lab" ? `${base} · TN tuần ${formatWeekList(s.weeks)}` : base;
}

export function isFull(group: Pick<Group, "registered" | "capacity">): boolean {
  return group.registered >= group.capacity;
}

// ---------------------------------------------------------------------------
// Program track (chương trình đào tạo)
// ---------------------------------------------------------------------------

/** Badge text for a group's program: "L · đại trà"; an unknown prefix keeps its code. */
export function programBadge(group: Pick<Group, "theoryGroup">): string {
  const code = programOf(group);
  return code === "" ? programLabel(code) : `${code} · ${programLabel(code)}`;
}

/** One program present in the pasted courses, with how many groups belong to it. */
export interface ProgramCount {
  code: string;
  count: number;
}

/**
 * Programs present in `courses` with their group counts, known codes first
 * (L, A, CC, TN) and any other prefix after them in alphabetical order.
 */
export function programCounts(courses: Course[]): ProgramCount[] {
  const counts = new Map<string, number>();
  for (const course of courses) {
    for (const group of course.groups) {
      const code = programOf(group);
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  const rank = (code: string) => {
    const known = (PROGRAM_CODES as readonly string[]).indexOf(code);
    return known < 0 ? PROGRAM_CODES.length : known;
  };
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => rank(a.code) - rank(b.code) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/** "L — đại trà (18 nhóm)", the label of one choice in the program card. */
export function programOptionLabel({ code, count }: ProgramCount): string {
  return `${code === "" ? "?" : code} — ${programLabel(code)} (${count} nhóm)`;
}

// ---------------------------------------------------------------------------
// Age of a paste. `now` is always passed in, so the helpers stay pure.
// ---------------------------------------------------------------------------

/** Pasted data older than 30 minutes may show seat counts that have changed since. */
export const STALE_PASTE_MS = 30 * 60 * 1000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Milliseconds between an ISO timestamp and `now`; null if it is missing or unreadable. */
function ageOf(pastedAt: string | null, now: number): number | null {
  if (typeof pastedAt !== "string") return null;
  const at = Date.parse(pastedAt);
  return Number.isNaN(at) ? null : Math.max(0, now - at);
}

/**
 * How long ago the data was pasted, in Vietnamese: "vừa xong", "12 phút trước",
 * "2 giờ trước", "hôm qua", "3 ngày trước". A missing or unreadable timestamp
 * (a save from before this was stored) is "không rõ thời điểm".
 */
export function formatAge(pastedAt: string | null, now: number): string {
  const age = ageOf(pastedAt, now);
  if (age === null) return "không rõ thời điểm";
  if (age < MINUTE_MS) return "vừa xong";
  if (age < HOUR_MS) return `${Math.floor(age / MINUTE_MS)} phút trước`;
  if (age < DAY_MS) return `${Math.floor(age / HOUR_MS)} giờ trước`;
  const days = Math.floor(age / DAY_MS);
  return days === 1 ? "hôm qua" : `${days} ngày trước`;
}

/** True when the data is older than STALE_PASTE_MS, or its age is unknown. */
export function isStalePaste(pastedAt: string | null, now: number): boolean {
  const age = ageOf(pastedAt, now);
  return age === null || age >= STALE_PASTE_MS;
}

/** "CO2007:L01_L02" → "L01_L02". */
export function groupIdOf(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}

/** 0.4567 → "46%". */
export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
