import type { Day } from "../parser";
import type { Schedule } from "../solver";
import { campusLabel, contiguousRuns } from "../view/format";
import { PERIOD_TIMES } from "./periods";

// iCalendar (RFC 5545) export of one schedule. Pure: no DOM, no clock (the
// caller passes the DTSTAMP), so the same input always gives the same text.

export const TIMEZONE = "Asia/Ho_Chi_Minh";

export interface IcsOptions {
  /** Monday of week 1, "YYYY-MM-DD" (another day of that week is moved back to its Monday). */
  semesterStart: string;
  /** courseCode → course name, for SUMMARY. */
  courseNames: Record<string, string>;
  /** DTSTAMP of every event. */
  stamp: Date;
}

/** One class meeting: one run of consecutive periods of one session, in one week. */
export interface IcsEvent {
  uid: string;
  /** Local date and times, "YYYYMMDD" / "HHMMSS". */
  date: string;
  start: string;
  end: string;
  summary: string;
  location: string;
  description: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → UTC midnight of that date, or null if it is not a real date. */
function parseDate(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === ymd ? date : null;
}

const ymd = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** The Monday of the week containing `date` ("YYYY-MM-DD"), or null for an invalid date. */
export function mondayOf(date: string): string | null {
  const parsed = parseDate(date);
  if (!parsed) return null;
  const sinceMonday = (parsed.getUTCDay() + 6) % 7; // Monday → 0 … Sunday → 6
  return ymd(new Date(parsed.getTime() - sinceMonday * 86_400_000));
}

/** Date of `day` (2 = Thứ 2 … 8 = Chủ nhật) in teaching week `week`, counted from the Monday of week 1. */
export function dateOf(semesterStart: string, week: number, day: Day): string | null {
  const monday = mondayOf(semesterStart);
  if (!monday) return null;
  const offset = (week - 1) * 7 + (day - 2);
  return ymd(new Date(parseDate(monday)!.getTime() + offset * 86_400_000));
}

/** "06:50" → "065000". */
const clock = (time: string) => `${time.replace(":", "")}00`;

/**
 * Every class meeting of the schedule, in pick → session → period run → week
 * order. Consecutive periods of a session form one event (first start to last end).
 */
export function icsEvents(schedule: Schedule, options: Omit<IcsOptions, "stamp">): IcsEvent[] {
  if (!mondayOf(options.semesterStart)) return [];
  return schedule.picks.flatMap((pick) => {
    const group = pick.group.group;
    const name = options.courseNames[pick.courseCode];
    return group.sessions.flatMap((session) =>
      contiguousRuns(session.periods).flatMap(([first, last]) =>
        session.weeks.flatMap((week) => {
          const date = dateOf(options.semesterStart, week, session.day);
          const from = PERIOD_TIMES[first];
          const to = PERIOD_TIMES[last];
          if (!date || !from || !to) return [];
          return [
            {
              uid: `${pick.courseCode}-${group.id}-d${session.day}-p${first}-w${week}@tkb-hcmut`,
              date: date.replaceAll("-", ""),
              start: clock(from.start),
              end: clock(to.end),
              summary: `${pick.courseCode}${name ? ` · ${name}` : ""}${session.kind === "lab" ? " (TN)" : ""}`,
              location: `${session.room} · ${campusLabel(session.campus)}`,
              description: `Nhóm ${group.id}`,
            },
          ];
        }),
      ),
    );
  });
}

/** TEXT value escaping: backslash, semicolon, comma and newlines. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

const encoder = new TextEncoder();

/**
 * Folds a content line so no line is longer than 75 octets (UTF-8); a
 * continuation line starts with one space. Never splits a character.
 */
export function foldLine(line: string): string[] {
  const lines: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = lines.length === 0 ? 75 : 74; // continuation lines spend one octet on the space
    if (octets + size > limit) {
      lines.push(lines.length === 0 ? current : ` ${current}`);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  lines.push(lines.length === 0 ? current : ` ${current}`);
  return lines;
}

/** "20260922T120000Z". */
function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** The whole calendar: CRLF line endings, folded lines, with a VTIMEZONE (+07:00, no DST). */
export function scheduleToIcs(schedule: Schedule, options: IcsOptions): string {
  const stamp = utcStamp(options.stamp);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//tkb-hcmut//Xep thoi khoa bieu//VI",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText("Thời khoá biểu")}`,
    `X-WR-TIMEZONE:${TIMEZONE}`,
    "BEGIN:VTIMEZONE",
    `TZID:${TIMEZONE}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0700",
    "TZOFFSETTO:+0700",
    "TZNAME:ICT",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...icsEvents(schedule, options).flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TIMEZONE}:${event.date}T${event.start}`,
      `DTEND;TZID=${TIMEZONE}:${event.date}T${event.end}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `LOCATION:${escapeText(event.location)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return `${lines.flatMap(foldLine).join("\r\n")}\r\n`;
}
