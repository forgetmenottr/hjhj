/** Day of week as used by HCMUT: 2..7 = Thứ 2..Thứ 7, 8 = Chủ nhật (Sunday). */
export type Day = 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** One weekly meeting of a group (one row of the "Thứ / Tiết / Phòng ..." table). */
export interface Session {
  day: Day;
  /** Period numbers (tiết), e.g. [2, 3, 4]. */
  periods: number[];
  /** Room code, e.g. "C5-202". */
  room: string;
  /** 1 = CS1 (Lý Thường Kiệt), 2 = CS2 (Dĩ An); null if missing. */
  campus: 1 | 2 | null;
  /** Raw "BT/TN" column; usually empty, do not rely on it. */
  labField: string | null;
  /** Teaching weeks (1-based), e.g. [1..7, 9..16]. */
  weeks: number[];
  /** "lab" when no two weeks are consecutive, otherwise "theory". */
  kind: "theory" | "lab";
}

/** A registrable class group, e.g. "A01_A01" (theory_practice) or "A01" (theory only). */
export interface Group {
  /** "A01_A01" or "A01". */
  id: string;
  /** Part of the id before "_" (or the whole id). */
  theoryGroup: string;
  /** Part of the id after "_"; null if the id has no "_". */
  practiceGroup: string | null;
  registered: number;
  capacity: number;
  language: "V" | "TA" | string;
  /** null if empty or "Chưa/Đang phân công". */
  lecturer: string | null;
  /** Same rule as `lecturer`; null if there is no practice group. */
  labLecturer: string | null;
  /** Last integer on the group line (Sĩ số LT). */
  theoryClassSize: number | null;
  sessions: Session[];
}

export interface Course {
  code: string;
  name: string;
  /** From the summary row that precedes the course; null if absent. */
  credits: number | null;
  groups: Group[];
}

export interface ParseWarning {
  /** 1-based line number in the original input. */
  line: number;
  /** The offending line, trimmed. */
  text: string;
  message: string;
}

export interface ParseResult {
  courses: Course[];
  warnings: ParseWarning[];
}
