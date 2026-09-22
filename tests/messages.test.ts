import { describe, expect, it } from "vitest";
import { diagnosticText, PARSE_TEMPLATES, parseWarningText, SOLVER_TEMPLATES, TIME_TEMPLATES, timeWarningText } from "../src/app/messages";
import { defaultPrefs } from "../src/app/state";
import { parse, PARSE_WARNING_CODES } from "../src/lib/parser";
import { SOLVER_DIAGNOSTIC_CODES, solve } from "../src/lib/solver";
import { buildMasks, TIME_WARNING_CODES } from "../src/lib/timing";
import { readFixture } from "./fixtureText";

const CO2007 = readFixture("CO2007.txt");
const CO2011 = readFixture("CO2011.txt");

/** Derived: line `n` (1-based) of `text` edited. */
function editLine(text: string, n: number, edit: (line: string) => string): string {
  const lines = text.split(/\r?\n/);
  lines[n - 1] = edit(lines[n - 1]);
  return lines.join("\n");
}

/** Looks translated: Vietnamese letters, no leftover placeholders. */
function expectVietnamese(text: string, english: string) {
  expect(text).not.toBe(english);
  expect(text).toMatch(/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i);
  expect(text).not.toMatch(/undefined|null|NaN|\[object/);
}

describe("every library code has a Vietnamese template", () => {
  it("parser, timing and solver", () => {
    expect(Object.keys(PARSE_TEMPLATES).sort()).toEqual([...PARSE_WARNING_CODES].sort());
    expect(Object.keys(TIME_TEMPLATES).sort()).toEqual([...TIME_WARNING_CODES].sort());
    expect(Object.keys(SOLVER_TEMPLATES).sort()).toEqual([...SOLVER_DIAGNOSTIC_CODES].sort());
  });
});

describe("real warnings are translated", () => {
  it("parse warnings from edited fixture lines", () => {
    // Line 7 is CO2007 A01_A01's theory session: "Thứ 2 | - 2 3 4 - … | A4-409 | 1 | | 1234567-90123456…".
    const texts = [
      editLine(CO2007, 7, (l) => l.replace("A4-409", "")), // no room
      editLine(CO2007, 7, (l) => l.replace("\t1\t", "\t\t")), // no campus
      editLine(CO2007, 7, (l) => l.replace("- 2 3 4 - -", "- 2 3 4 -")), // 15 period columns
      editLine(CO2007, 7, (l) => l.replace("1234567-9", "1234567-8")), // week digit off
      `${CO2007}\nxin chào`, // unrecognized line
    ];
    const warnings = texts.flatMap((t) => parse(t).warnings);
    expect(new Set(warnings.map((w) => w.code))).toEqual(
      new Set(["session-no-room", "unknown-campus", "period-column-count", "week-digit-mismatch", "unrecognized-line"]),
    );
    for (const w of warnings) expectVietnamese(parseWarningText(w), w.message);
    expect(parseWarningText(warnings.find((w) => w.code === "period-column-count")!)).toBe("Cột tiết có 15 ô thay vì 16 ô.");
  });

  it("mask warnings", () => {
    const courses = parse(CO2011).courses;
    const warnings = buildMasks([...courses, ...courses]).warnings;
    expect(warnings.map((w) => w.code)).toEqual(["duplicate-course"]);
    expectVietnamese(timeWarningText(warnings[0]), warnings[0].message);
  });

  it("solver diagnostics: relaxed, and locked groups that overlap", () => {
    const courses = buildMasks([...parse(CO2007).courses, ...parse(CO2011).courses]).courses;
    const relaxedPrefs = { ...defaultPrefs(), campuses: { mode: "required" as const, allowed: [2 as const] }, language: { mode: "required" as const, allowed: ["TA"] } };
    const lockedPrefs = { ...defaultPrefs(), locked: { CO2007: "A01_A01", CO2011: "L01" } };
    const details = [...solve(courses, relaxedPrefs).diagnosticDetails, ...solve(courses, lockedPrefs).diagnosticDetails];
    expect(details.map((d) => d.code)).toEqual(["course-blocked-combined", "course-blocked-combined", "relaxed", "locked-overlap"]);
    for (const d of details) expectVietnamese(diagnosticText(d), d.message);
    expect(diagnosticText(details[3])).toBe("Hai nhóm đã khoá CO2007 A01_A01 và CO2011 L01 trùng giờ: Thứ 2 tiết 2–3 (tuần 1–7, 9–16).");
    expect(diagnosticText(details[2])).toBe("Đã tạm chuyển thành ưu tiên (trọng số 1000): Cơ sở, Ngôn ngữ.");
  });
});

describe("fallback to the English text", () => {
  it("for an unknown code or malformed params", () => {
    expect(parseWarningText({ code: "new-code", params: {}, message: "some English" })).toBe("some English");
    expect(parseWarningText({ code: "invalid-group-id", params: { id: 5 }, message: "invalid group id" })).toBe("invalid group id");
    expect(diagnosticText({ code: "locked-overlap", params: { a: "X", b: "Y", overlap: [{ day: 99 }] }, message: "overlap" })).toBe("overlap");
    expect(timeWarningText({ code: "toString", params: {}, message: "english" })).toBe("english");
    expect(diagnosticText({ code: "relaxed", params: null as unknown as Record<string, unknown>, message: "relaxed" })).toBe("relaxed");
  });
});
