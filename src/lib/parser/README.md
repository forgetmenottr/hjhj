# Parser (Phase 1)

`parse(text)` turns text copied from the HCMUT **registration page** into
`Course[]` plus `ParseWarning[]`. It is a pure function with no DOM or React
dependency, and it never throws: a line it cannot use is skipped and reported
as a warning with its 1-based line number in the original input.

```ts
import { parse } from "./lib/parser"; // relative to src/

const { courses, warnings } = parse(pastedText);
```

Types are in [`types.ts`](./types.ts). Tests: [`tests/parser.test.ts`](../../../tests/parser.test.ts).
Fixtures: [`tests/fixtures/`](../../../tests/fixtures/).

## Input format

Several courses may be pasted back-to-back. Lines are trimmed, blank lines are
ignored, and CRLF / LF / CR line endings are all accepted. Each non-blank line
is one of the following types:

| Line type | Example | Handling |
|---|---|---|
| Summary header | `STT  Mã MH  Tên MH  Số tín chỉ  BB/TC` | skipped |
| Summary row | `1  CO2007  Kiến trúc máy tính  4.0` | credits stored by course code |
| Course header | `CO2007 - Kiến trúc máy tính` | starts a new course |
| Group-table header | `Nhóm lớp  DK/ Sĩ số  Ngôn ngữ  ...` | skipped |
| Group line | `A01_A01  34/40  V  A01  ...  80` | starts a new group in the current course |
| Session-table header | `Thứ  Tiết  Phòng  CS  BT/TN  Tuần học` | skipped |
| Session line | `Thứ 2  - 2 3 4 - ... -  A4-409  1    1234567-90123456---` | added to the current group |

Anything else produces an "unrecognized line" warning.

Credits come from the summary row with the same course code. The lookup runs
after the whole text is read, so the summary row may appear before or after the
course header. No matching row → `credits: null`. The trailing BB/TC column is
optional and must not start with a digit, so a name that ends in a number
(`Giải tích 1  4.0`) keeps its number and the credits are still read correctly.

### Tabs or spaces

The registration page separates columns with tabs. When a line has tabs, the
parser reads its columns by position. If the columns do not line up (or tabs
were turned into spaces by an editor or chat app), it falls back to reading
whitespace-separated tokens around fixed anchors, described below. Both paths
give the same result on the fixtures.

## Group lines

```
Nhóm lớp | DK/Sĩ số | Ngôn ngữ | Nhóm LT | Giảng viên | Nhóm BT | Giảng viên BT/TN | Sĩ số LT | #
A01_A01  | 34/40    | V        | A01     |            | A01     |                  | 80       |
A01      | 72/80    | V        | A01     |            |         |                  | 80       |
```

A group id comes in two forms:

- **`A01_A01`**: theory group `A01` plus practice/lab group `A01`. Courses with
  labs (e.g. CO2007) use this form. `theoryGroup = "A01"`, `practiceGroup = "A01"`.
- **`A01`**: theory only. The course has no practice/lab group (e.g. CO2011).
  `theoryGroup = "A01"`, `practiceGroup = null`, `labLecturer = null`.

Codes match `/^[A-Z]{1,4}\d{2}$/` (`A01`, `CC07`, `L03`, `TN01`).
`theoryGroup` and `practiceGroup` come from the id itself.

Other fields:

- `registered/capacity` from the `34/40` token.
- `language` is the next token: `V` (Vietnamese) or `TA` (English); other values are kept as-is.
- `theoryClassSize` is the last integer on the line.
- Lecturer cells may be empty or quoted. Quotes are stripped. An empty cell or
  `Chưa/Đang phân công` ("not assigned yet") becomes `null`.

When tabs are collapsed, lecturer text is told apart from the `Nhóm LT` and
`Nhóm BT` columns because only those tokens look like group codes. Lecturer
names contain no digits.

## Session lines

```
Thứ   | Tiết (16 cells)                   | Phòng  | CS | BT/TN | Tuần học
Thứ 2 | - 2 3 4 - - - - - - - - - - - -   | A4-409 | 1  |       | 1234567-90123456--------------
```

- **Day**: `Thứ 2`..`Thứ 7` → 2..7, `Chủ nhật` (Sunday) → 8.
- **Periods**: 16 cells, each `-` or the period number, so `- 2 3 4 - …` → `[2, 3, 4]`.
- **Room**: must match `/^[A-Z]\d{1,2}-\d{3}$/` (`C5-202`, `B1-212`, `B10-207`).
  There are no online classes. A session line with no room is skipped with a warning.
- **Campus**: `1` = CS1 (Lý Thường Kiệt), `2` = CS2 (Dĩ An).
- **BT/TN**: kept raw in `labField`. It is usually empty; do not rely on it.

### Weeks string

The character at 0-based index `i` is week `i + 1`, and `-` means no class that
week. The digit written there is `week % 10`, so week 10 shows as `0`:

```
1234567-90123456--------------  →  [1..7, 9..16]   (no class in week 8)
-----6---0-2-4----------------  →  [6, 10, 12, 14]
------7-9-1-3-----------------  →  [7, 9, 11, 13]
```

The position decides the week. If a digit does not equal `week % 10`, the
parser still uses the position and adds a warning.

## Lab detection

Labs meet every other week. A session is `kind: "lab"` when its weeks list has
**no two consecutive week numbers** (e.g. `[6, 10, 12, 14]`), and `"theory"`
otherwise (e.g. `[1..7, 9..16]`). Labs usually last 5 periods, but the period
count is not used to decide the kind.

## Warnings

A warning has `{ line, text, message }`. The parser warns and continues when:

- a line is not recognized;
- a group line comes before any course header;
- a session line has no valid group above it. This also covers sessions under a
  group line that was rejected, so they never attach to the previous group;
- a session line has no room, no weeks string or no periods (the session is skipped);
- a weeks digit does not match its position, the campus is missing or unknown,
  or the periods column does not have 16 cells (the session is kept).

## Assumptions and limits

- Input is normalized to Unicode NFC. Non-breaking spaces become plain spaces.
- Each group or session occupies exactly one line. A lecturer cell that spans
  several lines inside quotes is not supported.
- A course or group pasted twice is kept twice. Removing duplicates is left to the UI.
