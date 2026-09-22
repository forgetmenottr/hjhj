import { parse, type Course, type ParseWarning } from "../lib/parser";

/** Raw text of ONE course, as stored in localStorage. */
export interface Paste {
  code: string;
  raw: string;
}

/** A paste after parsing. `course` is null only if the text no longer contains that course. */
export interface ParsedPaste {
  code: string;
  course: Course | null;
  warnings: ParseWarning[];
}

// Same line shapes the parser recognizes (see src/lib/parser/README.md).
const COURSE_HEADER = /^([A-Z]{2}\d{4})\s+-\s+\S/;
/** Lines that belong to the course BELOW them: the summary header and summary rows. */
const PREAMBLE = /^(?:STT(?:\s|$)|\d+\s+[A-Z]{2}\d{4}\s)/;

function clean(line: string): string {
  return line.replace(/ /g, " ").trim();
}

/**
 * Splits pasted text into one block per course, so each course can be stored,
 * replaced and re-parsed on its own. A block starts at its summary lines
 * ("STT ..." / "1  CO2007 ...") right above the course header; the first block
 * also keeps anything before it, so stray lines still produce warnings.
 */
export function splitByCourse(raw: string): Paste[] {
  const lines = raw.normalize("NFC").split(/\r\n|\r|\n/);
  const cleaned = lines.map(clean);
  const headers = cleaned.flatMap((line, index) => {
    const match = COURSE_HEADER.exec(line);
    return match ? [{ index, code: match[1] }] : [];
  });

  const starts = headers.map((header, k) => {
    if (k === 0) return 0;
    const floor = headers[k - 1].index;
    let start = header.index;
    while (start - 1 > floor && (cleaned[start - 1] === "" || PREAMBLE.test(cleaned[start - 1]))) start--;
    while (start < header.index && cleaned[start] === "") start++; // blank lines stay with the previous block
    return start;
  });

  return headers.map((header, k) => ({
    code: header.code,
    raw: lines.slice(starts[k], starts[k + 1] ?? lines.length).join("\n").trimEnd(),
  }));
}

/**
 * Adds incoming course blocks: a course already present is replaced in place,
 * a new one is appended (paste order).
 */
export function mergePastes(existing: Paste[], incoming: Paste[]): { pastes: Paste[]; added: string[]; replaced: string[] } {
  const pastes = [...existing];
  const added: string[] = [];
  const replaced: string[] = [];
  for (const paste of incoming) {
    const index = pastes.findIndex((p) => p.code === paste.code);
    if (index < 0) {
      pastes.push(paste);
      added.push(paste.code);
    } else {
      pastes[index] = paste;
      if (!added.includes(paste.code) && !replaced.includes(paste.code)) replaced.push(paste.code);
    }
  }
  return { pastes, added, replaced };
}

export function parsePaste(paste: Paste): ParsedPaste {
  const result = parse(paste.raw);
  return {
    code: paste.code,
    course: result.courses.findLast((c) => c.code === paste.code) ?? null,
    warnings: result.warnings,
  };
}

/** Parsed courses that have at least one group (the ones the solver can use). */
export function schedulableCourses(pastes: Paste[]): Course[] {
  return pastes
    .map(parsePaste)
    .flatMap((p) => (p.course && p.course.groups.length > 0 ? [p.course] : []));
}
