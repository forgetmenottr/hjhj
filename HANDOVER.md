# HANDOVER — tkb_web (HCMUT timetable planner)

How this repo was built, why it looks the way it does, and what to do next.
What the product *is* lives in [SPEC.md](SPEC.md); the Vietnamese user README is
[README.md](README.md); each library has its own README under `src/lib/*/`.
Every number below was re-measured on 2026-09-23 on the six fixtures in `tests/fixtures/`.

---

## 1. TL;DR

- **What:** a client-only web app. HCMUT students paste the course blocks copied from the **registration page**, set constraints, and get the top-5 conflict-free timetables. From there they can lock groups, handle a full group, and register from a checklist. Exports: `.ics`, PNG, print.
- **Status:** Phases 1–7 are done and pushed (`origin/main` at `7659fd3`). The Vercel project is **not created yet** (§9). 401 tests pass (16 files); `tsc -b`, `oxlint` and `vite build` are clean.
- **Stack:** React 19, Vite 8, TypeScript ~6.0, Tailwind v4 and Vitest 5. The solver runs in a module Web Worker. The only runtime dependencies are `react` and `react-dom`.
- **Run:** `npm install`, then `npm run dev` → http://localhost:5173/
- **Test:** `npm test` (about 15 s). Full gate: bash `npm test && npx tsc -b && npm run lint && npm run build`. On PowerShell 5.1 the same gate is in §7.
- **Deploy:** Vercel (Vite preset, `npm run build` → `dist`, served at `/`; no `vercel.json`). The project still has to be created by importing the repo on Vercel (§9). GitHub Actions (`.github/workflows/ci.yml`) only runs test, lint and `tsc -b`; it does not deploy.

---

## 2. Domain primer

**Source.** The only supported input is text copied from the HCMUT *course registration* page ("Đăng ký môn học"). The registration-*result* page has a different layout and is explicitly unsupported (SPEC §2). There are no online classes in the data.

**Shape of one course block** (real, from `tests/fixtures/CO2007.txt`; `⇥` = tab):

```
STT⇥⇥Mã MH⇥Tên MH⇥Số tín chỉ⇥BB/TC⇥                  ← summary header (ignored)
1⇥⇥CO2007⇥Kiến trúc máy tính⇥4.0⇥⇥                    ← summary row: credits 4.0
CO2007 - Kiến trúc máy tính                             ← course header
Nhóm lớp⇥DK/ Sĩ số⇥Ngôn ngữ⇥Nhóm LT⇥Giảng viên⇥…      ← group table header (ignored)
A01_A01⇥34/40⇥V⇥A01⇥⇥A01⇥⇥80⇥                         ← group line
Thứ⇥Tiết⇥Phòng⇥CS⇥BT/TN⇥Tuần học                      ← session table header (ignored)
Thứ 2⇥- 2 3 4 - - - - - - - - - - - -⇥A4-409⇥1⇥⇥1234567-90123456--------------
Thứ 2⇥- - - - - - - 8 9 10 11 12 - - - -⇥C5-202⇥1⇥⇥-----6---0-2-4----------------
```

The group line `A01_A01⇥34/40⇥V⇥A01⇥⇥A01⇥⇥80⇥` reads, column by column:
- **Group id** `A01_A01`: theory group `A01` + practice/lab group `A01`.
- **Registered/capacity** `34/40`. The group counts as full when registered ≥ capacity.
- **Language** `V`. The other value is `TA` (English).
- **Nhóm LT** `A01`.
- **Lecturer**: empty here. An empty cell or `"Chưa/Đang phân công"` becomes `null`.
- **Nhóm BT** `A01`.
- **Lab lecturer**: empty here.
- **Sĩ số LT** `80`: the last integer on the line (`theoryClassSize`). SP1031 has `-1` here, which parses as `null`.

The first session line reads:
- **Day** `Thứ 2`, stored as day 2.
- **Periods** in 16 cells, so `- 2 3 4 - …` = periods 2–4.
- **Room** `A4-409` and **campus** `1`.
- **BT/TN** column: empty.
- **Weeks string** `1234567-90123456------…`.

Encodings:
- **Group ids.** `A01_A01` = theory group `_` practice/lab group (`Group.practiceGroup = "A01"`). `A01` (no `_`) = theory only (`practiceGroup = null`). Regex: `/^([A-Z]{1,4}\d{2})(?:_([A-Z]{1,4}\d{2}))?$/`.
- **Program track** (Phase 7). The leading letters of the theory group code are the *chương trình đào tạo*: `L` = đại trà, `A` = Tiếng Nhật / Việt-Pháp, `CC` = chất lượng cao, `TN` = tài năng. `programOf(group)` extracts them with `/^[A-Z]+/`; an unknown prefix is kept as it is and labelled "Khác", never dropped. Per fixture: CO2001 L1/A1/CC2, CO2003 L9/A2/CC7/TN1, CO2007 L8/A2/CC7/TN1, CO2011 L3/A1/CC5/TN1, **SK2001 A4/CC60 only**, SP1031 L7/A5/CC9. SK2001 is therefore the fixture that triggers the missing-program diagnostic.
- **Weeks string.** 30 characters. The character at index *i* is week *i*+1, and `-` means no class. The digit should be `week % 10`; if it is not, position wins and the parser warns (`week-digit-mismatch`).
  - `1234567-90123456` = weeks 1–7 and 9–16; week 8 is the usual mid-term break.
- **Labs** meet on alternating weeks, e.g. `-----6---0-2-4` = weeks 6, 10, 12, 14. `Session.kind` is `"lab"` when no two weeks are consecutive, otherwise `"theory"`.
  - The "BT/TN" column is unreliable, so it is ignored.
  - Two labs of different groups can share a room and time on different weeks without conflict.
- **Short-term courses.** SK2001 has 64 single-session groups, each running only 5 weeks: `12345…` = 1–5, `-----67-901…` = 6–7 and 9–11, `-----------23456…` = 12–16. It has **0.0 credits**, which must stay `0`, not `null`. Most of its groups are full. It is the stress fixture for equivalence collapsing, partial-term display and zero-credit handling.
- **Campus.** `1` = CS1 (Lý Thường Kiệt), `2` = CS2 (Dĩ An). Anything else becomes `null` with an `unknown-campus` warning.
- **Rooms.** `/^[A-Z]\d{1,2}-[A-Z0-9]+$/`. This accepts `C5-202` and `B10-207`, and also the halls `C5-HOITRUONG`, `H1-GDH1` and `H6-GDH6` from SP1031.
- **Days.** 2..7 = Thứ 2..Thứ 7, and 8 = Chủ nhật. In the mask, the day index is `day - 2` (`FIRST_DAY = 2`).
- **Periods.** Tiết 1–16. Period *n* runs from (n+5):00 to (n+5):50 (`src/lib/export/periods.ts`).
  - Tiết 1 = 06:00–06:50, tiết 7 = 12:00–12:50, tiết 16 = 21:00–21:50.
  - A session covering periods 2–4 runs 07:00–09:50.
  - Score buckets (`src/lib/solver/constants.ts`): `MORNING` = 1–6, `AFTERNOON` = 7–12, `EVENING` = 13–16, `EARLY` = 1–2. `DAY_PARTS` maps the three half-day names onto the first three. No fixture group teaches after tiết 12, so the evening bucket is empty on this data.
- **Several courses in one paste.** Each course block keeps its own `STT` header and summary row, and the STT value may repeat (all `1`). Credits are matched by **course code** (SPEC §3). `src/app/pastes.ts:splitByCourse` cuts the text at each course header, together with the summary lines just above it.

---

## 3. Architecture

```
paste text ──splitByCourse──► Paste[] {code, raw}          src/app/pastes.ts   (stored in localStorage)
                │ parsePaste (per course, on every render via useMemo)
                ▼
            parse() ─► Course[] + ParseWarning[]           src/lib/parser/
                │  (UI thread → postMessage, structured clone)
                ▼
  Web Worker: handleRequest(): buildMasks() ─► IndexedCourse[] + TimeWarning[]   src/lib/timing/
                               solve()      ─► SolveResult                        src/lib/solver/
                │  SolveResponse {id, ok, result, maskWarnings}
                ▼
  useSolver(dispatch) ─► reducer (src/app/state.ts) ─► React components (src/components/)
                                     │                        │
                                     ▼                        ▼
                    storage.ts (tkb:v1)          src/lib/view/ (grid blocks, labels)
                                                  src/lib/export/ (ics, PNG layout)
```

| Directory | Owns | Rules |
|---|---|---|
| `src/lib/parser/` | text → `Course[]` and warnings with codes | pure; never throws; keeps duplicate courses/groups (timing drops them) |
| `src/lib/timing/` | 3360-bit masks, conflict checks, duplicate rule | pure; never mutates its input |
| `src/lib/solver/` | filter → equivalence → DFS → score → relax → diagnostics; worker protocol | pure except `worker.ts`; normalizes preferences; never throws |
| `src/lib/view/` | display helpers: grid blocks, week filters and labels, formatting, palette, checklist text | pure; Vietnamese strings live here and in `src/app/messages.ts` |
| `src/lib/export/` | `.ics` text (RFC 5545), PNG layout (data only), period times | pure; the caller passes the clock (`stamp`) |
| `src/app/` | reducer and actions, selections (locks), storage, paste splitting, `useSolver`, Vietnamese messages, clipboard/download, canvas drawing | apart from `src/App.tsx` (focus handling, `window.print`) and the components, the only code that touches `localStorage`, `Worker`, `navigator`, `document` |
| `src/components/` | React UI (Tailwind v4, Catppuccin Mocha tokens prefixed `ctp-`) | no business logic; everything testable lives in `lib/` or `app/` |

**Data model.** Parser types are in SPEC §6 and `src/lib/parser/types.ts`. Warnings now also carry `code` and `params`; see §9 for how this departs from the SPEC. Downstream types:
- `IndexedGroup { key: "CO2007:A01_A01"; courseCode; group: Group; mask: TimeMask }` and `IndexedCourse { code; name; credits; groups: IndexedGroup[] }` (`timing/build.ts`). A **group key** `"CODE:GROUPID"` is the identity used everywhere: locks, excluded groups, UIDs, test assertions.
- `Preferences` (`solver/types.ts`):
  - seven group-level constraints, in `CONSTRAINTS` order: `programs`, `campuses`, `daysOff`, `partsOff`, `language`, `freeSeats`, `avoidLecturers`, each with a `Mode`: `"off" | "required" | "preferred"`. `programs` with an empty `allowed`, and `partsOff` with an empty `parts`, filter nothing and are never relaxed (`isActive`), so the program card can default to "Bắt buộc" with nothing chosen;
  - `locked: Record<courseCode, groupId>` and `excluded: string[]` (keys);
  - `weights` (0..10), `topK` (5) and `maxNodes` (5,000,000).
- `SolveResult { status: "ok" | "relaxed" | "infeasible"; schedules: Schedule[]; relaxed; diagnostics: string[]; diagnosticDetails: SolverDiagnostic[]; stats: {nodes, ms, truncated} }`. `Schedule { picks: Pick[]; penalty; score; breakdown; violations }`, and `Pick { courseCode; group: IndexedGroup; alternatives: string[] }`.
- `AppState` (`src/app/state.ts`):
  - inputs: `pastes`, `prefs`;
  - navigation and solver: `step` (1–5), `solverStatus`, `result` (tagged with `id` and `version`), `error`, `notice`, `version`, `request`;
  - selections and export: `autoLocked`, `registered`, `semesterStart`;
  - results view: `selected`, `autoRun`.
- `Paste` (`app/pastes.ts`) = `{ code; raw; pastedAt: string | null }`. `pastedAt` is an ISO timestamp set when the block is added or re-pasted; a save written before Phase 7 loads as `null`.
- **localStorage** key `tkb:v1` = `{ pastes, prefs, autoLocked, registered, semesterStart }` (`src/app/storage.ts`). Results are never stored. On load, the data is merged over the defaults, normalized, and pruned: locks and marks that point at groups no longer pasted are dropped.

**Key invariant — time masks** (`src/lib/timing/constants.ts`, `mask.ts`):
- `MAX_WEEK = 30` × `DAYS = 7` × `PERIODS = 16` = `TOTAL_BITS = 3360` bits, stored as a `Uint32Array(105)` (`MASK_WORDS`).
- `bitIndex = ((week-1)*7 + (day-2))*16 + (period-1)`.
- Because 16 divides 32, one (week, day) is exactly half a word. The scorer depends on this (`dayBits` in `solver/score.ts`).
- **Two sessions conflict only if they are on the same day AND share a period AND share a week.** That is exactly "the masks share a bit", so `conflicts(a, b)` = `intersects(a.mask, b.mask)`. This is why alternating-week labs at the same time and place are compatible.

**Runtime flow of a solve.**
1. `App.tsx` calls `useSolver(dispatch).run(courses, prefs)`.
2. `run` dispatches `solveStart{id}` and posts `{id, courses, prefs}` to `src/lib/solver/worker.ts`.
3. The worker answers `handleRequest(data)` = `buildMasks` + `solve`, wrapped in try/catch.
4. The response is matched by `id`. Stale ids are ignored twice: in the hook, and again in the reducer through `request.id`.
5. The reducer stores the result with the input `version` it was computed from. `isResultStale` compares that version with the current one.
6. After `SOLVE_TIMEOUT_MS = 15_000`, the worker is terminated and restarted.
7. `cancel()` also restarts the worker, because a running DFS cannot be interrupted any other way.

---

## 4. Public API reference (`src/lib/*`)

Signatures are copied from the source. Types are summarized in §3.

### parser — `src/lib/parser/`
| Signature | Purpose |
|---|---|
| `parse(text: string): ParseResult` | Parse registration-page text into `{ courses, warnings }`; tab or space layouts; never throws |
| `programOf(group: Pick<Group, "theoryGroup">): string` | Program track prefix: `"L01_L02"` → theory group `"L01"` → `"L"`; `""` when the code has no leading letters |
| `PROGRAM_CODES` (`["L","A","CC","TN"]`) / `PROGRAM_LABELS: Record<string,string>` / `programLabel(code: string): string` | The four known programs and their Vietnamese names; anything else is "Khác" |
| `PARSE_WARNING_CODES` (16 codes) / `type ParseWarningCode` | Every `ParseWarning.code`, e.g. `session-no-room`, `week-digit-mismatch` |
| types `Day, Session, Group, Course, ParseWarning{line,text,message,code,params}, ParseResult` | Data model |

### timing — `src/lib/timing/`
| Signature | Purpose |
|---|---|
| `MAX_WEEK=30, DAYS=7, FIRST_DAY=2, PERIODS=16, TOTAL_BITS=3360, MASK_WORDS=105, type TimeMask = Uint32Array` | Mask layout |
| `bitIndex(week: number, day: number, period: number): number` | Bit of a slot, or -1 if out of range |
| `emptyMask(): TimeMask` | New zero mask |
| `setSlot(mask: TimeMask, week: number, day: number, period: number): boolean` / `hasSlot(mask: TimeMask, week: number, day: number, period: number): boolean` | Set / test one slot (false when out of range) |
| `orInto(target: TimeMask, source: TimeMask): void` | `target \|= source` (mutates target) |
| `intersects(a: TimeMask, b: TimeMask): boolean` | Shared slot? (stops at the first word that overlaps) |
| `intersection(a: TimeMask, b: TimeMask): TimeMask` / `popcount(mask: TimeMask): number` / `slots(mask: TimeMask): Slot[]` | AND, bit count, decode to `{week, day, period}` |
| `buildSessionMask(s: Session): { mask: TimeMask; outOfRange: number }` | One session's mask |
| `buildMasks(courses: Course[]): { courses: IndexedCourse[]; warnings: TimeWarning[] }` | Index every group; later duplicate wins; warns |
| `TIME_WARNING_CODES` (5) / `type TimeWarningCode` | `duplicate-course`, `duplicate-group`, `slots-out-of-range`, `internal-overlap`, `group-no-sessions` |
| `conflicts(a: IndexedGroup, b: IndexedGroup): boolean` | Two groups clash |
| `conflictSlots(a: Timed, b: Timed): Slot[]` / `conflictSummary(a: Timed, b: Timed): ConflictSummaryItem[]` / `summarizeSlots(sorted: Slot[]): ConflictSummaryItem[]` (`type Timed = IndexedGroup \| TimeMask`) | Where they clash, grouped as `{day, periods, weeks}` |

### solver — `src/lib/solver/` (`index.ts` re-exports everything except `protocol.ts` and `worker.ts`)
| Signature | Purpose |
|---|---|
| `solve(courses: IndexedCourse[], input: Preferences): SolveResult` | Top-K pipeline: strict → relaxed → infeasible, with diagnostics |
| `normalizePreferences(input: Preferences): Preferences` | Repair any shape (bad modes → off, weights clamped 0..10, bad lists → []) |
| `DEFAULT_PREFERENCES`, `CONSTRAINTS`, `type Mode`, `type ConstraintName` | Solver defaults (all constraints off); constraint names in fixed order |
| `SOLVER_DIAGNOSTIC_CODES` (15) / `type SolverDiagnostic {code, params, message}` | Structured diagnostics, 1:1 with `diagnostics`. Phase 7 added `course-no-program` `{course, allowed, available}` |
| `MORNING, AFTERNOON, EVENING, EARLY, DAY_PARTS, RELAX_WEIGHT=1000, MAX_WEIGHT=10, IDLE_PER_DAY=11, DEFAULT_TOP_K=5, DEFAULT_MAX_NODES=5_000_000` | Constants |
| `DAY_PART_NAMES` (`["morning","afternoon","evening"]`) / `type DayPart` / `interface DayPartOff { day: Day; part: DayPart }` | Half-day names and one selected half-day |
| `constraintsWithMode(prefs: Preferences, mode: Mode): ConstraintName[]` | Constraints in a given mode **that have something selected** (see `isActive`) |
| `isActive(name: ConstraintName, prefs: Preferences): boolean` | False only for `programs` / `partsOff` with an empty list |
| `violates(name: ConstraintName, group: Group, prefs: Preferences): boolean` | Constraint predicate |
| `normalizeName(name: string): string` | Lowercase, strip diacritics, `đ→d` (lecturer matching) |
| `applyHardRules(course: IndexedCourse, prefs: Preferences): IndexedGroup[]` | Drop excluded groups; keep only the locked group (always hard) |
| `applyConstraints(groups: IndexedGroup[], names: ConstraintName[], prefs: Preferences): IndexedGroup[]` | Filter by constraints |
| `equivalenceKey(g: IndexedGroup, prefs: Preferences): string` / `equivalenceClasses(groups: IndexedGroup[], prefs: Preferences): IndexedGroup[][]` | Groups that score identically |
| `buildCandidates(courseCode: string, groups: IndexedGroup[], prefs: Preferences): Candidate[]` | One representative per class, with alternatives and features |
| `compareStrings(a: string, b: string): number` | Code-unit order (deterministic) |
| `groupFeatures(group: IndexedGroup, prefs: Preferences): GroupFeatures` | Per-group masks, flags, cells and slot counts |
| `createScorer(prefs: Preferences, relaxed: readonly ConstraintName[]): Scorer` | `penalty(picks, combined?)`, `explain(picks)` (reference), `start(): ScoreState` (incremental: `push`, `pop`, `penaltyWith`) |
| `orderByMrv(domains: Domain[]): Domain[]` | Fewest candidates first, ties by code |
| `compatibilityTable(domains: Domain[]): Uint32Array[][]` | Pairwise candidate compatibility as bitsets (`table[i][j]`, i < j), computed once |
| `search(domains: Domain[], scorer: Scorer, topK: number, maxNodes: number): SearchResult` | DFS over MRV-ordered domains with forward checking; top-K; node budget |
| `compareFound(a: Found, b: Found): number` | Penalty, then pick keys (deterministic ties) |
| `handleRequest(request: unknown): SolveResponse` (`protocol.ts`) | Worker body: `buildMasks` + `solve`; errors → `{ok:false, error}` (Vietnamese) |

### export — `src/lib/export/`
| Signature | Purpose |
|---|---|
| `PERIOD_TIMES: Readonly<Record<number, PeriodTime>>`, `PERIOD_COUNT = 16` | Period n = (n+5):00–(n+5):50 |
| `scheduleToIcs(schedule: Schedule, options: IcsOptions): string` | Whole VCALENDAR: VTIMEZONE Asia/Ho_Chi_Minh (+07:00), CRLF, folded lines |
| `icsEvents(schedule: Schedule, options: Omit<IcsOptions, "stamp">): IcsEvent[]` | One event per (run of consecutive periods, week); stable UIDs |
| `mondayOf(date: string): string \| null` / `dateOf(semesterStart: string, week: number, day: Day): string \| null` | Date math on `YYYY-MM-DD` |
| `escapeText(value: string): string` / `foldLine(line: string): string[]` | RFC 5545 escaping; 75-octet folding that never splits a character |
| `imageLayout(input: ImageInput): ImageLayout` | PNG layout as rects, circles and texts, 1080 px wide (`IMAGE_WIDTH`); drawn by `src/app/imageExport.ts:renderPng` |

### view — `src/lib/view/`
| Signature | Purpose |
|---|---|
| `toGridBlocks(schedule: Schedule): GridBlock[]` | One block per run of consecutive periods of a session |
| `blocksForWeek(blocks: GridBlock[], week: WeekFilter): GridBlock[]` / `weeksWithClasses(blocks: GridBlock[]): number[]` (`type WeekFilter = number \| "all"`) | Week selector |
| `standardWeeks(courses: Course[]): number[] \| null` | The usual term (per-course vote) |
| `weekLabel(block: GridBlock, standard: number[] \| null): string \| null` | `"tuần 6,10,12,14"` for labs; `"T12–16"` for theory outside the usual term |
| `periodRange(blocks: GridBlock[]): { first: number; last: number } \| null` / `usedDays(blocks: GridBlock[]): Day[]` / `assignLanes(dayBlocks: GridBlock[]): PlacedBlock[]` | Grid frame; side-by-side lanes for overlapping blocks |
| `describeBlock(b: GridBlock, locked = false): string` | Tooltip / aria-label |
| `formatWeeks(weeks: number[]): string` / `formatRanges(numbers: number[]): string` / `contiguousRuns(numbers: number[]): [number, number][]` / `formatWeekList(weeks: number[]): string` | `"T6–7, 9–11"`, `"1–7, 9–16"`, `[[2,4],[8,8]]`, `"6,10,12,14"` |
| `formatSession(s: Session): string` / `formatCredits(credits: number \| null): string` / `campusLabel(campus: 1 \| 2 \| null): string` | `"T2 · tiết 2–4 · A4-409 · CS1"`, `"0 TC"`, `"CS1"` |
| `isFull(group: Pick<Group, "registered" \| "capacity">): boolean` / `groupIdOf(key: string): string` / `percent(value: number): string` / `itemLabel(item: string): string` | Full group, `"CO2007:L01_L02"` → `"L01_L02"`, `"46%"`, Vietnamese item name |
| `programBadge(group: Pick<Group,"theoryGroup">): string` / `programCounts(courses: Course[]): ProgramCount[]` / `programOptionLabel(p: ProgramCount): string` | `"L · đại trà"`; the programs present in the pasted courses with their group counts (known codes first); `"L — đại trà (18 nhóm)"` |
| `STALE_PASTE_MS = 30 * 60 * 1000` / `formatAge(pastedAt: string \| null, now: number): string` / `isStalePaste(pastedAt: string \| null, now: number): boolean` | `"vừa xong"`, `"12 phút trước"`, `"2 giờ trước"`, `"hôm qua"`, `"3 ngày trước"`, `"không rõ thời điểm"`; stale ≥ 30 min **or** unknown. `now` is always a parameter |
| `DAY_SHORT`, `DAY_LONG`, `ALL_DAYS`, `STEP_LABELS`, `ITEM_LABELS` | Vietnamese labels |
| `relaxedViolations(schedule: Schedule, relaxed: readonly string[]): Violation[]` / `preferredViolations(schedule: Schedule, relaxed: readonly string[]): Violation[]` / `scheduleLabel(schedule: Schedule, index: number, relaxed: readonly string[]): string` | `"Lịch 2 · 87 điểm"` or `"Lịch 2 · ⚠ 1 yêu cầu"` |
| `staleCourses(schedule: Schedule, pastedAt: Record<string, string \| null \| undefined>, now: number): string[]` | Courses of the schedule whose pasted data is stale, in pick order (drives the step 4–5 banner) |
| `checklistText(schedule: Schedule): string` / `scheduleCredits(schedule: Schedule, credits: Record<string, number \| null \| undefined>): { total: number; unknown: string[] }` | Step 5 copy text (`CODE  GROUP` lines) and credit total |
| `MOCHA`, `COURSE_ACCENTS`, `accentOf(index: number)`, `hexToRgb(hex: string): [number, number, number]`, `mixHex(top: string, bottom: string, amount: number): string` | Palette shared by the canvas and the contrast test |

### app layer — `src/app/` (not a library, but where the product logic sits)
- **`state.ts`:**
  - `reducer(state: AppState, action: Action): AppState` with 21 action types, `initialState(saved?)` and `defaultPrefs()`;
  - selectors: `canGoTo(state, step, hasCourses?)`, `selectedSchedule(state)`, `isResultStale(state)`, `selectionsOf(state)`, `responseAction(response, elapsedMs)`;
  - constant `AUTO_RERUN_DELAY_MS = 200`.
- **`selection.ts`:** pure lock algebra over `Selections {locked, excluded, autoLocked, registered}`:
  - `lockGroup`, `unlockCourse`, `excludeGroup`, `unexcludeGroup`;
  - `registerGroup`, `unregisterGroup`;
  - `markFull(s, key, picks)`, `undoAutoLocks(s)`;
  - `pruneSelections(s, groupIdsByCourse(pastes))`, `sameSelections`, `groupKey`, `splitKey`.
- **`storage.ts`:** `loadSaved(storage?)`, `saveState(state, storage?)`, `readDate(value)`, `STORAGE_KEY = "tkb:v1"`.
- **`pastes.ts`:** `splitByCourse(raw, pastedAt = null)`, `mergePastes(existing, incoming)`, `parsePaste(paste)`, `schedulableCourses(pastes)`. The clock is the caller's: `App.addPaste` dispatches `{ type: "addPaste", raw, at: new Date().toISOString() }`.
- **`useSolver.ts`:** `useSolver(dispatch: Dispatch<Action>): SolverControls` returns `{ run(courses, prefs), cancel() }` only.
- **`messages.ts`:** `parseWarningText`, `timeWarningText`, `diagnosticText` (Vietnamese; English on fallback) and `PARSE_TEMPLATES` / `TIME_TEMPLATES` / `SOLVER_TEMPLATES`.
- **`browser.ts`:** `downloadBlob(blob, filename)`, `copyText(text)`.
- **`imageExport.ts`:** `renderPng(layout)`.

---

## 5. Phase history

The repo was produced phase by phase by an AI coding agent working from written prompts. A human read each phase report before writing the next prompt. Phases 1–3 predate the project's own git repo: during them, the enclosing git root was the user's home directory and the agent was told not to commit. The human created the repo and made the first two commits (`8bc2615` = Phases 1–3, `4b36c5a` = Phase 4); the agent committed Phases 5 and 6 itself, as instructed (`Co-Authored-By` trailer).

| Phase | Commit | Tests after (files) | Shipped |
|---|---|---|---|
| 1 parser | `8bc2615` Initial commit | 45 (parser) | `parse()` |
| 2 timing | `8bc2615` | +30 (timing) | masks, `conflicts()` |
| 3 solver | `8bc2615` | +46 (solver) = **121 (3)** | pure `solve()` |
| 4 worker + UI 1–4 | `4b36c5a` | **158 (8)** | worker protocol, reducer, storage, steps 1–4 |
| 5 lock / full / weeks | `6c6c743` | **185 (9)** | locks, "Đã đầy" re-run, week selector, relaxed display |
| 6 ship | `d1ab088` | **346 (16)** | step 5, export, Vietnamese codes, a11y, perf, SK2001, deploy |
| 7 program / half-day / timestamps | `3c48963` | **395 (16)** | `programs` + `partsOff` constraints, missing-program diagnostic, paste ages |

These counts were re-run at each commit in temporary worktrees on 2026-09-23.

**Lost and recreated commits.** Six commits made on 2026-09-28 were never pushed and were lost when the author's machine failed. They were recreated on 2026-11-02 from a written brief, which describes four changes:
- moving deployment from GitHub Pages to Vercel (`vite.config.ts` back to base `/`, `deploy.yml` replaced by a test-only `ci.yml`, `engines.node = 24.x`, README) — recreated;
- removing `conflictTable` from `solver/search.ts` as unused — **not** recreated then: at that point `search()` still called it. It was removed in the forward-checking commit below, which replaced it;
- syncing SPEC, this file and the lib READMEs with the code — recreated;
- a project favicon in place of the default Vite logo — recreated.

A second brief (also 2026-11-02) described the remaining lost work: **forward checking in the solver with an 8-course benchmark** ("perf: forward checking in the solver", §8), and Vietnamese documents for the author (`docs/cau-truc-du-an.md`, `docs/viec-con-lai.md`).

### Phase 1 — parser
**Shipped:** `parse()`, handling tab-separated and space-collapsed layouts; warnings instead of exceptions; tests on real fixtures and on edge cases derived from them.

**Decisions made in review:**
- **Summary-row regex fixed** so that course names ending in a digit ("Giải tích 1  4.0") are not read as credits. The optional trailing BB/TC column may not start with a digit (`SUMMARY_ROW` in `parse.ts`).
- **Weeks string:** position wins over the digit, with a warning.
- **Lab detection** by non-consecutive weeks, because the BT/TN column is unreliable.
- **Unassigned lecturers:** `"Chưa/Đang phân công"` → `null`.

### Phase 2 — timing
**Shipped:** the 3360-bit masks, `conflicts` and `conflictSummary`, and a test proving that alternating-week labs at the same time do not conflict.

**Decision:** `buildMasks` never mutates its input and warns about out-of-range slots and overlaps inside one group.

### Step 0 of Phase 3 and Phase 3 — solver
**Housekeeping (step 0):**
- `Project_plan.md` → `SPEC.md` with a plain `mv`, because `git mv` was impossible without a project repo.
- The "later duplicate wins" rule moved into `buildMasks`.
- The timing perf-test threshold was raised to 3000 ms.

**Shipped:**
- filter → equivalence collapsing → MRV DFS → top-K → relaxation → diagnostics;
- a brute-force reference in `tests/solver.test.ts` that is independent of search and equivalence;
- scoring formulas documented in `src/lib/solver/README.md`;
- mutation checks were done by hand (see §7).

**Decisions:**
- No branch & bound (§6).
- Relaxed items count only toward `penalty`, not toward `score`.
- All attempts share one `maxNodes` budget.

### Phase 4 — Web Worker and UI steps 1–4
**Shipped:**
- `protocol.ts` + `worker.ts`;
- the reducer, storage (`tkb:v1`) and `useSolver`;
- Paste / Preview / Preferences / Results pages; mobile-first; dark Catppuccin Mocha;
- jsdom smoke test.

**Deviations from the prompt and decisions:**
- **`useSolver(dispatch)` returns only `{run, cancel}`.** Status and result live in the reducer; the prompt asked for "hook: run/cancel/status/result". This keeps the stale and step logic pure and unit-tested. SPEC §5 was updated in Phase 5.
- **App default `freeSeats: "preferred"`.** With the solver defaults, schedule 1 was made entirely of full groups: re-verified, `CO2007:CC03_CC06` 40/40 + `CO2011:CC05` 80/80. With the app defaults it is `L04_L08` 29/40 + `L03` 110/120.
- **Pastes are split per course before storage.** As a result, parse-warning line numbers are relative to each course block.
- **Theme variables are prefixed `ctp-`** so they do not clash with Tailwind utilities (`text-base`).
- Solver diagnostics were left in English (translated in Phase 6).

### Phase 5 — locks, "Đã đầy" (group full) re-run, week selector, relaxed display
**Shipped:**
- lock ("Giữ nhóm này", "Chọn nhóm này") and exclude, with auto re-run on step 4 (200 ms debounce);
- `markFullAndRerun`: exclude the key and auto-lock the other picks, with an infeasible banner offering "Thử lại, không giữ các môn khác";
- week selector with pure helpers;
- relaxed schedules show "⚠ K yêu cầu" instead of a score.

**Decisions:**
- **Selected tab moved into the reducer.** `markFullAndRerun(key)` needs "the current schedule", and every re-run resets to tab 1. `ResultTabs` no longer remounts, so keyboard focus stays on the clicked button.
- **Weeks without classes look disabled but stay clickable.** The prompt asked for both "shown disabled" and "choose week 8 → empty state".
- **The equivalent-group hint is a confirm step** ("Có thể đăng ký nhóm tương đương: …" → "Tìm nhóm khác"). It was tested with derived data, because the only fixtures at the time (CO2007, CO2011) have no equivalent groups. SK2001 and SP1031, added in Phase 6, do.
- **`autoLocked` accumulates across "Đã đầy" clicks**, and undo removes all automatic locks.
- **Locking and excluding are mutually exclusive.**
- **"Khôi phục mặc định" keeps locks.**
- **While a re-run is pending, the old result stays visible but dimmed** (`aria-busy`).
- **Focus fallback.** When a re-run removes the button that had focus, focus goes to the status region.

### Phase 6 — checklist, export, Vietnamese messages, a11y, perf, short-term courses, deploy
**Shipped:**
- step 5 checklist, `.ics` / PNG / print, structured warning codes with Vietnamese templates;
- WCAG contrast test, keyboard-only walkthrough, perf work;
- SK2001 handling, GitHub Pages workflow, README (Vietnamese) and `docs/user-testing.md`.

**Findings and deviations:**
- **Step 0:** `git status` showed 4 untracked fixtures (CO2001, CO2003, SK2001, SP1031), exactly the data the prompt said to expect. The agent proceeded and committed them with the phase instead of stopping.
- **Parser bug** found by real data. `ROOM` was `/^[A-Z]\d{1,2}-\d{3}$/`, which silently dropped 9 SP1031 sessions (the hall rooms). Groups with no sessions become "free" for the solver.
  - Widened to `[A-Z0-9]+`.
  - Added the timing warning `group-no-sessions` as a guard.
- **Performance.** With the six real courses, the defaults took ≈ 5.5 s in bundled Node and ≈ 40 s under vitest (re-measured: 5,520 ms / 39,825 ms), so under vitest the 15 s worker timeout would fire. Profiling showed leaf scoring dominated, not the conflict checks.
  - The prompt suggested a conflict table; it was implemented, **plus** incremental scoring.
  - Outputs are identical to the old solver on all 4 test configurations (§8).
- **Vietnamese messages.** `code` + `params` were added next to the English text, and the old fields were kept for compatibility.
- **Checking "Đã đăng ký"** creates a user lock and does **not** re-run (the group is already in the schedule being registered). "Đã đầy" does re-run from step 5, and the app stays on step 5.
- **Standard term.** A per-course vote for the most common weeks list among theory sessions, not a vote per session, so SK2001's 64 groups cannot outvote the others. The spec text said "most common weeks list among theory sessions".
- **Contrast fixes:**

  | Pair | Before | After |
  |---|---|---|
  | disabled primary button | 4.10:1 | 5.65:1 |
  | `subtext/70` (placeholder, week chip) | 4.33:1 | 7.37:1 |
  | input borders | 1.8–1.9:1 | 4.4–4.75:1 (new token `overlay1`) |

- **Keyboard fixes:**
  - After "Thêm môn", focus fell to `<body>`. It now returns to the paste box.
  - The date input had no focus ring: Chrome only matches `:focus-within` there, so the ring is drawn on that.

### Phase 7 — program track, half-day off, paste timestamps
**Shipped:**
- `programs`: `programOf` / `PROGRAM_LABELS` in `src/lib/parser/program.ts`, a new group-level constraint, the step-3 program card (first, visually separated, "Bước đầu tiên: chọn chương trình của bạn"), program badges in steps 2, 4 and 5, and the `course-no-program` diagnostic with its "Bỏ lọc chương trình" action;
- `partsOff`: half-days off sharing the card "Ngày và buổi nghỉ" (and its mode) with `daysOff`, `EVENING` / `DAY_PARTS` in `solver/constants.ts`;
- `Paste.pastedAt`, `formatAge` / `isStalePaste` / `staleCourses`, the "Dán … trước" lines in steps 1–2 and the stale banner in steps 4–5.

**Decisions and deviations:** see §6 (the eight Phase 7 rows) — the main ones are the empty-selection rule (`isActive`), the app-level default for the program mode, treating an unknown paste age as stale, and putting `programOf` in the parser rather than in `view/` so the solver can use it without a layering violation.

---

## 6. Decision log

| Decision | Rationale | Where | Reversible? |
|---|---|---|---|
| 30-week mask (3360 bits) | Weeks strings are 30 characters; 16 periods = half a 32-bit word, so bit tricks work per (week, day) | `timing/constants.ts`, `solver/score.ts:dayBits` | Costly: every mask and the scorer layout depend on it |
| Conflict = shared bit | Implements "same day AND shared period AND shared week" exactly; alternating-week labs stay compatible | `timing/mask.ts:intersects`, `timing/conflicts.ts` | No: it is the domain rule |
| Equivalence collapsing | Groups with identical masks, sessions and campus, and the same language, free-seat and lecturer-avoid status score the same. Search one representative (smallest id); list the rest as `alternatives`. SK2001: 64 → 42 classes; all six fixtures: nodes 4.39M → 2.78M | `solver/equivalence.ts` | Yes: bench-only switch (§8); results unchanged, only nodes |
| No branch & bound | Several metrics are not monotone as courses are added (the average days per week can drop), so no cheap admissible bound exists | `solver/README.md` Algorithm §3 | Yes, if someone finds a sound bound |
| Relaxation with `RELAX_WEIGHT = 1000` | Instead of "no result", required constraints become soft and very expensive, and the report says which were broken | `solver/solve.ts`, `solver/constants.ts` | Yes |
| Relaxed items excluded from `score` | The score measures soft preferences; the relaxed penalty is in `penalty`. The UI therefore shows "⚠ K yêu cầu" instead of the score (Phase 5) | `solver/score.ts:explain`, `view/summary.ts:scheduleLabel` | Yes |
| Locked / excluded never relaxed | They are the user's explicit decisions; relaxing them would silently undo a registration | `solver/filter.ts:applyHardRules` | Yes, but should not be |
| App default `freeSeats: "preferred"`; solver `DEFAULT_PREFERENCES` all off | The solver stays neutral for tests; the app avoids suggesting full groups (schedule 1 was all full) | `app/state.ts:defaultPrefs` | Yes |
| Status / result in the reducer; `useSolver` returns `{run, cancel}` | Stale detection (`version`), request-id matching and step logic are pure and unit-tested; the hook only wraps the Worker | `app/state.ts`, `app/useSolver.ts` | Yes |
| Later duplicate wins | A re-pasted course or group replaces the earlier one in place (keys stay unique); the parser keeps both copies and timing decides | `timing/build.ts:latestByKey`, `app/pastes.ts:mergePastes` | Yes |
| Pastes stored per course (raw text) | Re-paste and remove work per course; raw text is re-parsed, so parser fixes apply to old data | `app/pastes.ts:splitByCourse` | Yes |
| `autoLocked` separate from user locks | "Đã đầy" locks the other picks automatically; "Thử lại, không giữ các môn khác" must undo only those. Registering a group turns its auto lock into a user lock | `app/selection.ts:markFull`, `undoAutoLocks`, `registerGroup` | Yes |
| Selections pruned on paste change, lock action and load | A stale result or an old save must not lock a course or group that no longer exists | `app/selection.ts:pruneSelections`, `app/storage.ts:loadSaved` | Yes |
| Auto re-run only on step 4 (and "Đã đầy" or undo on step 5), 200 ms debounce | Quick clicks share one run; edits on steps 2–3 only mark the result stale; checking "Đã đăng ký" must not reshuffle the checklist | `app/state.ts:withSelections`, `App.tsx` effects | Yes |
| Union week view by default + week labels | The grid shows all weeks. Labs show "tuần 6,10,…"; theory outside the usual term shows "T1–5" / "T6–7, 9–11" / "T12–16" | `view/grid.ts:standardWeeks`, `weekLabel` | Yes |
| Week grid keeps the all-weeks frame | Days and rows do not jump when switching weeks | `components/TimetableSection.tsx` (`frame` prop) | Yes |
| Conflict table + incremental scoring | Leaf rescans dominated (≈ 5.5 s bundled); exact same integer totals, formulas and addition order, so the penalties are bit-identical | `solver/score.ts:createState` (the Phase 6 `conflictTable` was replaced by forward checking, next row) | Yes (the full `penalty()` path remains the reference) |
| Forward checking with a static MRV order | Cuts nodes 51–63% on six courses and 67–82% on eight, counted on complete searches (§8). Candidates are still tried in index order and only subtrees with no complete assignment are pruned, so the schedules and their order are those of a plain DFS. Dynamic reordering would change the order in which leaves are found, so truncated runs would no longer be comparable | `solver/search.ts:compatibilityTable`, `search` | Yes |
| Program track lives in `src/lib/parser/program.ts`, not in `src/lib/view/` | `solver/filter.ts` needs `programOf`, and `view` already depends on `solver`; the parser is the lowest layer, and the prefix is a parsing convention of the group id | `lib/parser/program.ts`, re-exported from `lib/parser/index.ts` | Yes |
| An empty `programs.allowed` / `partsOff.parts` filters nothing and is never relaxed | The program card defaults to "Bắt buộc" with nothing chosen, and a requirement that cannot reject anything must not be reported as violated or relaxed. Guarded in two places: `violates` (for direct callers and the equivalence key) and `constraintsWithMode` via `isActive`. The Phase 3 constraints keep their old behavior, so all 346 earlier tests are untouched | `solver/filter.ts:isActive`, `violates` | Yes |
| App default `programs: "required"` with `allowed: []`; solver `DEFAULT_PREFERENCES` still all off | Same split as `freeSeats` in Phase 4: the solver stays neutral for tests, the app shows the mode the student needs. Harmless because of the rule above | `app/state.ts:defaultPrefs` | Yes |
| The program flag (`violates("programs")`, i.e. whether the group's program is outside `allowed`) is part of the equivalence key; `daysOff` / `partsOff` are not | Two groups can share every slot and differ only in program (the Phase 7 test derives one from CO2011:CC01), so collapsing one that the program filter rejects with one it keeps would hide a filtered group. Groups of different programs that the filter treats alike still collapse. Day and half-day violations follow from the sessions, which the key already serializes | `solver/equivalence.ts:equivalenceKey`, mirrored in `tests/solver.test.ts:referenceCollapse` | Yes |
| `course-no-program` is its own diagnostic, alongside `course-blocked` for the other blockers | "No group meets the required Chương trình" does not say what to do; naming the programs the course *does* have (SK2001: only A and CC) does, and it is what the "Bỏ lọc chương trình" button hangs on | `solver/solve.ts:explainRequired`, `components/StatusBanner.tsx` | Yes |
| "Cả ngày" and the three parts stay two constraints | `daysOff` keeps its Phase 3 meaning and its own storage; the card only shares a mode. Picking all three parts is not rewritten into "Cả ngày" (the prompt's rule), and "Cả ngày" disables but never clears the parts, so unticking it restores the user's choice | `components/PreferencesForm.tsx:DayPartGrid`, `solver/filter.ts` | Yes |
| An unknown paste age counts as stale | `pastedAt: null` only comes from a save written before Phase 7, so the data is at least one session old; the banner is a warning, never a block, and claiming freshness we cannot verify is the worse error | `view/format.ts:isStalePaste` | Yes |
| The clock is a parameter everywhere (`now`), held in `App` state and ticked every 30 s | Keeps `formatAge` / `isStalePaste` / `staleCourses` pure and their tests deterministic; the reducer takes the timestamp on the `addPaste` action instead of reading `Date.now()` | `App.tsx` (`CLOCK_MS`), `app/state.ts`, `app/pastes.ts` | Yes |
| Structured codes + Vietnamese templates with English fallback | Libraries stay language-neutral; unknown codes or bad params never show "undefined" | `lib/*/types.ts`, `app/messages.ts` | Yes |
| Print = the same tokens swapped to Catppuccin Latte | Every utility switches to light colors with no second set of classes | `src/index.css` `@media print` | Yes |
| `ctp-` token prefix | Avoids clashes like `text-base` (Tailwind font size) vs `base` (color) | `src/index.css` `@theme` | Costly (touches every class) |
| `.ics`: one event per run of periods per week, stable UIDs without the date | Re-importing after changing the semester start updates events instead of duplicating them | `lib/export/ics.ts:icsEvents` | Yes |
| Semester start snapped to its Monday | Week and day arithmetic assumes week 1 starts on Monday; the UI says which Monday was used | `lib/export/ics.ts:mondayOf`, `components/ExportPanel.tsx` | Yes |
| Vite `base` = default `/` for dev, build and preview; no `vercel.json` | Vercel serves the app at the domain root. Until 2026-11-02 the build used `/<repo>/` for GitHub Pages. The app has one URL and no router (no `window.location`, `history.` or router import in `src/`), so no rewrites are needed | `vite.config.ts` | Yes |

---

## 7. Testing strategy

**Layers:**
- **Unit tests** per library, run in Node: parser, timing, solver, view, export, messages.
- **Brute-force reference.** `tests/solver.test.ts:bruteForce` enumerates every combination for CO2007 + CO2011 with `createScorer().penalty`. `solve()` must return the same ranking and penalties. This also pins the incremental scorer to the full rescan.
- **Real-data invariants.** SK2001 counts (`tests/shortterm.test.ts`): 64 groups, 42 classes, 15 → 11 with `freeSeats` required. They are checked against the test's *own* grouping, not the solver's code.
- **Code-coverage checks for messages.** `parser.test.ts`, `timing.test.ts` and `solver.test.ts` wrap `parse` / `buildMasks` / `solve`, and their last test asserts that every emitted warning or diagnostic has a known code. `messages.test.ts` asserts that every code has a template.
- **Mutation testing: manual, no tooling in the repo.** In Phases 2–3 the agent deliberately broke rules (e.g. flipped a comparison) and confirmed that tests failed. `sed` quoting failed on Windows, so it used Python string replacement. Worth automating (§10).
- **jsdom smoke tests** (`tests/app.smoke.test.tsx`). `useSolver` is mocked with a synchronous `handleRequest` behind a stable `useMemo`, which the debounce needs. They drive the full flows: paste, lock, "Đã đầy", infeasible → retry, relaxed labels, week selector, step 5 checklist and copy, SK2001 label.
- **Contrast** (`tests/contrast.test.ts`). It parses the tokens from `src/index.css` and composites alpha and `color-mix(in oklab)` like the browser. Text must reach ≥ 4.5:1 and UI borders ≥ 3:1. It also checks the print (Latte) palette.
- **Performance sanity checks.** `tests/perf.test.ts` runs the 4 configurations on all fixtures with a < 3000 ms limit each. `solver.test.ts` has a < 2000 ms defaults check, and `timing.test.ts` a < 3000 ms `conflicts()` loop. These catch order-of-magnitude regressions only.
- **Browser checks (not in the repo).** Headless Chrome was driven over the DevTools Protocol by throwaway scripts: flows at 375 and 1280 px, real `.ics`/`.png` downloads, print emulation, a keyboard-only walk, and `vite preview` under `/tkb_web/` (the GitHub Pages base at the time; the base is now `/`). They are not committed; see §10.

**Fixture rule.** `tests/fixtures/*.txt` is **always real text copied from the registration page**, never typed or invented.
- The six fixtures are CO2001, CO2003, CO2007, CO2011, SK2001 and SP1031. CO2001's name "Kỹnăng chnghiệp cho kỹsư" is garbled as it was copied; keep it.
- An edge case is *derived* from a real fixture by a minimal, commented edit inside the test. Examples: `editLine(CO2007, 7, …)`; `withoutGroup(CO2007, "A01_A02")`; moving L04_L08's lab onto L04_L07's slot to create equivalent groups.
- If an expected value contradicts the fixture, fix the test, not the parser.

**Current counts** (`npx vitest run --reporter=json`, 2026-11-02): 401 tests in 16 files, ≈ 23 s.

| File | Tests | File | Tests |
|---|---|---|---|
| contrast.test.ts | 101 | app.smoke.test.tsx | 15 |
| solver.test.ts | 69 | ics.test.ts | 12 |
| parser.test.ts | 48 | grid.test.ts | 11 |
| state.test.ts | 42 | shortterm.test.ts | 10 |
| timing.test.ts | 32 | storage.test.ts | 9 |
| format.test.ts | 19 | messages.test.ts | 8 |
| summary.test.ts / perf.test.ts | 6 / 12 | protocol.test.ts | 4 |
| image.test.ts | 3 | | |

**Commands** (all verified; the same in PowerShell 5.1 and bash unless noted):
```bash
npm test                                          # everything
npx vitest run tests/solver.test.ts               # one file
npx vitest run -t "SK2001"                        # by test name (14 tests across files)
npx vitest run tests/state.test.ts -t "checklist" # file + name
npx vitest run tests/perf.test.ts --reporter=verbose   # prints the [perf] lines
npx tsc -b; npm run lint; npm run build           # individual gates
```
Full gate, bash: `npm test && npx tsc -b && npm run lint && npm run build`

Full gate, PowerShell 5.1 (no `&&`): `npm test; if ($?) { npx tsc -b }; if ($?) { npm run lint }; if ($?) { npm run build }`

Production check, both shells: `npm run build`, then `npm run preview` → http://localhost:4173/

---

## 8. Performance

**Input:** all six fixtures together.

| Course | Groups | Classes (defaults) |
|---|---|---|
| CO2001 | 4 | 4 |
| CO2003 | 19 | 19 |
| CO2007 | 18 | 18 |
| CO2011 | 10 | 10 |
| SK2001 | 64 | 42 |
| SP1031 | 21 | 20 |

**Configurations** (as in `tests/perf.test.ts`):
1. app defaults;
2. every weight at 10, `freeSeats` off, `timeOfDay` afternoon;
3. `campuses` required [1] + `daysOff` required [Thứ 2];
4. `freeSeats` required;
5. `programs` required [CC] (Phase 7 — CC is the only program every fixture has).

| Config | Status | Nodes | Nodes without equivalence | Bundled Node 24 | Vitest | Old solver (bundled) | Truncated |
|---|---|---|---|---|---|---|---|
| (1) | ok | 2,778,034 | 4,389,422 | 377 ms | 273–288 ms | 5,520 ms | no |
| (2) | ok | 2,778,034 | 4,389,422 | 383 ms | 381–434 ms | 5,657 ms | no |
| (3) | ok | 44,104 | 78,043 | 7 ms | 9–12 ms | 72 ms | no |
| (4) | ok | 100,372 | 109,389 | 23 ms | 26–28 ms | 131 ms | no |
| (5) | ok | 50,704 | 76,576 | not measured | 10–14 ms | n/a | no |

This table is the Phase 7 solver, before forward checking; the current numbers are under "Forward checking" below. Vitest columns are the range over 3 runs on 2026-09-23 (Windows 11, Node 24); (1)–(4) are unchanged from Phase 6 within noise, and their node counts are bit-identical, which is what pins the Phase 7 constraints as behavior-preserving when they are off. The "bundled Node" and "old solver" columns were not re-measured in Phase 7.

- **Browser:** the production build under `vite preview` at `/tkb_web/` (the Pages base at the time), config (1): solver 306–313 ms, round trip 313–318 ms over 3 runs (headless Chrome, Windows 11).
- **Equivalence classes per course** (groups → classes):
  - (3): CO2001 3→3, CO2003 5→5, CO2007 6→6, CO2011 7→7, SK2001 58→36, SP1031 11→10;
  - (4): CO2001 3→3, CO2003 6→6, CO2007 14→14, CO2011 9→9, SK2001 15→11, SP1031 14→13;
  - (5): CO2001 2→2, CO2003 7→7, CO2007 7→7, CO2011 5→5, SK2001 60→39, SP1031 9→9.
- **"Old solver"** = the Phase 5 code (a full 30×7 rescan per leaf), bundled and run side by side. `identical=true` for all four: same schedules, penalties, breakdowns, diagnostics and node counts.
- **Why vitest looks slower:** its SSR transform turns imported constants into getters, which is expensive in hot loops. `score.ts` copies them into module-level locals (`DAYS_PER_WEEK`, `IDLE_NORM`, …).

**Reproduce.**
- Nodes and vitest ms: `npx vitest run tests/perf.test.ts --reporter=verbose`.
- The bundled-Node and old-vs-new numbers came from throwaway scripts bundled with `npx rolldown <entry>.ts --format esm --platform node -o out.mjs`. They are not committed.
- Classes per course: `equivalenceClasses(applyConstraints(applyHardRules(course, p), constraintsWithMode(p, "required"), p), p).length`, with `p = normalizePreferences(prefs)`.

**Forward checking (2026-11-02).** Same configurations, on six courses and on an 8-course bench (the six fixtures plus clones of CO2007 and CO2011 with only the course code rewritten, built in `tests/perf.test.ts`). Vitest, range over 3 runs each, Windows 11, Node 24.19.0.

| Courses | Config | Nodes before | ms before | Nodes after | ms after | Truncated after |
|---|---|---|---|---|---|---|
| 6 | (1) | 2,778,034 | 408–433 | 1,347,479 | 236–311 | no |
| 6 | (2) | 2,778,034 | 505–558 | 1,347,479 | 275–339 | no |
| 6 | (3) | 44,104 | 10–13 | 16,414 | 8–11 | no |
| 6 | (4) | 100,372 | 26–29 | 36,703 | 20–23 | no |
| 6 | (5) | 50,704 | 11–14 | 23,364 | 10–11 | no |
| 8 | (1) | 5,000,000 (truncated) | 592–615 | 5,000,000 | 1,068–1,283 | **yes** |
| 8 | (2) | 5,000,000 (truncated) | 608–760 | 5,000,000 | 1,251–1,476 | **yes** |
| 8 | (3) | 107,194 | 19–25 | 23,629 | 9–17 | no |
| 8 | (4) | 2,048,235 | 303–308 | 375,335 | 153–254 | no |
| 8 | (5) | 217,590 | 34–48 | 72,672 | 21–36 | no |

- **Eight courses with nothing required are still truncated.** A complete search needs 59,714,230 nodes before and 19,638,693 after forward checking (measured with a raised budget in a throwaway test), both above `DEFAULT_MAX_NODES = 5,000,000`, which was not raised. The truncated runs got slower (≈ 0.6 s → 1.1–1.5 s): every one of the 5M nodes is now a live candidate that goes deeper into the tree and reaches more complete schedules, instead of a cheap rejected clash. `tests/perf.test.ts` asserts this truncation, so a change shows up as a test failure.
- **Identical results.** A throwaway differential test ran the old and the new `search()` on the same domains for all five configurations plus a relaxed run, on 6 and on 8 courses, with top-5 and top-50 and a budget large enough to finish: all 24 cases returned the same schedules, in the same order, with the same penalties. The brute-force parity tests in `tests/solver.test.ts` pass unchanged; only the MRV node-count test was rewritten, because it counted clashing candidates as nodes.

**Where the time goes** (defaults, six courses): 1,278,259 complete schedules (leaves), the same before and after forward checking. With the Phase 6 conflict-table search (2,778,034 nodes), the DFS alone with a no-op scorer took ≈ 200 ms under vitest. The Phase 5 solver took 39,825 ms under vitest on the same input, so a full per-leaf rescan was nearly all of the cost.

**Levers if it gets slow again** (e.g. 7–8 courses):
1. **`maxNodes`** (5,000,000). Six courses use 1.35M; eight courses with nothing required need 19.6M and are truncated (see above). When it is hit, the result is `truncated`, the UI shows a yellow note, and a `truncated` diagnostic is added. Raising it costs time; lowering it trades completeness.
2. **Equivalence collapsing** removes 37% of nodes on this data. The key already ignores rooms and lecturer names; only the lecturer-avoid flag counts. Collapsing further, e.g. across campuses, would be unsafe, because campus feeds `campuses` and `noCampusSwitch`.
3. **Pairwise table** (done in Phase 6 as a conflict table; now the bitset `compatibilityTable`): no 105-word mask pass at a node.
4. **Forward checking** (done, 2026-11-02): per-depth live bitsets, branch pruned as soon as a future course has none left. Node counts changed, results did not.
5. **Better ordering or bounds.** MRV by classes is already used. A sound lower bound would enable branch & bound; see the decision log for why none exists yet.
6. **Worker time limit:** `SOLVE_TIMEOUT_MS = 15_000` in `app/useSolver.ts`.

---

## 9. Known limitations & open items

**Not done yet:**
- **The Vercel project does not exist yet.** The repo is pushed (`forgetmenottr/hjhj`, renamed from `tkb_web`; `origin/main` at `7659fd3` before the 2026-11-02 commits). One-time setup on Vercel: Add New → Project → import the repo; the Vite preset is detected, build `npm run build`, output `dist`. Then replace the placeholder `https://<tên-dự-án>.vercel.app/` in `README.md` with the real URL.
- **The old GitHub Pages site is still up.** On 2026-11-02 `https://forgetmenottr.github.io/hjhj/` answered 200 (and `/tkb_web/` 404). With `deploy.yml` removed it will no longer update; turn Pages off in the repo settings once Vercel is live.
- **CI** (`.github/workflows/ci.yml`) runs `npm ci`, `npm test`, `npm run lint` and `npx tsc -b` on Node 24 for every push and pull request. It has not run on GitHub yet.
- **No screen-reader testing** (NVDA, TalkBack, VoiceOver). The keyboard-only walk was done in headless Chrome at 1280 px only, not at 375 px.
- **No user testing with students.** The script and the empty results table are in `docs/user-testing.md`.

**English still reaches the UI in a few places.** All library warning and diagnostic codes have Vietnamese templates. English remains in these places:
- the `diagnostics: string[]` field (kept for compatibility, not displayed);
- the fallback for an unknown code or malformed params;
- runtime error *details* appended to Vietnamese messages: the JS `error.message` in `protocol.ts` ("Lỗi khi xếp lịch: …") and the worker `event.message` in `useSolver.ts`;
- raw pasted lines shown under parse warnings (intended).

**Robustness gaps:**
- **A group with no sessions** is only *warned* about (`group-no-sessions`). The solver still treats it as schedulable at zero cost; excluding it would change the filter rules.
- **A single-week theory session would be classified as a lab** (`detectKind`: no two consecutive weeks). No fixture has one.
- **`maxNodes` headroom** is under 2× on the current six courses (see §8).

**Heuristics and display:**
- **Standard term** is decided by a per-course vote, with ties broken by more weeks and then a lexicographic key. It is a heuristic; unusual course mixes may label the wrong sessions.
- **Week label format "T1–5"** (T = tuần) can be misread as a day ("T2" = Thứ 2 elsewhere in the UI). The spec asked for this format.
- **In the PNG export, the lab week list is cut with "…"** in narrow columns (5–7 days).

**Test and tooling gaps:**
- **Equivalent-group hint** ("Có thể đăng ký nhóm tương đương") is only exercised with derived data in `tests/app.smoke.test.tsx`. SK2001 (64 → 42 classes) and SP1031 (21 → 20) have real equivalent groups, but no test clicks "Đã đầy" on one of them.
- **No committed browser or e2e tests.** The CDP scripts were throwaway.

**Other:**
- **Clipboard on Windows** turns `\n` into `\r\n` on copy (harmless).
- **The `docs/user-testing.md` table is empty.**

**Phase 7 limitations:**
- **The evening bucket (tiết 13–16) is untested against real data.** No fixture group teaches after tiết 12, so "Tối" can only be exercised by construction (`tests/solver.test.ts` proves it filters nothing on the fixtures).
- **A program prefix is only as good as the group id.** A course whose ids do not start with a letter gives `programOf` `""`, which is shown as "Khác" and offered in the card as `? — Khác (n nhóm)`. No fixture does this.
- **The program card lists only the programs of the pasted courses**, so a student who pastes one course sees only that course's programs. That is intended, but it means the card changes as courses are added.
- **`pastedAt` is not re-checked against the registration page.** The 30-minute threshold is a guess at how fast seat counts move; the banner never blocks anything.
- **The clock ticks every 30 s** (`CLOCK_MS` in `App.tsx`), so "Dán 12 phút trước" can be up to 30 s stale on screen.

**Where SPEC.md disagrees with the code** (the code is the truth): SPEC §5, §6, §8, §9 and §10 were brought in line with the code on 2026-11-02 (storage fields, no progress reporting, `ParseWarning.code`/`params`, sorted top-K array, MRV by classes, Vercel, the folder tree and the 5-step flow); §7 was rewritten in Phase 7, and on 2026-11-02 its equivalence wording was corrected (the key holds the program-filter flag, not the program itself). What remains:
- **§11 Phase 6 "Done when … v1.0 deployed":** not yet (no Vercel project); user testing is also pending.

**Corrected assumption from the original prompts (not in SPEC):** rooms were said to "always match `/^[A-Z]\d{1,2}-\d{3}$/`". SP1031's halls (`C5-HOITRUONG`, `H1-GDH1`, `H6-GDH6`) disproved it, and the parser was widened in Phase 6.

**TODO/FIXME markers in the code:** none (`grep -rniE "TODO|FIXME|XXX|HACK" src tests` finds nothing).

---

## 10. Ideas for future work

### Small (hours)
- **Translate the remaining English error details.** Map common `Error` cases to Vietnamese and keep the raw text in a collapsible "chi tiết".
  - Files: `src/lib/solver/protocol.ts`, `src/app/useSolver.ts`, `src/app/messages.ts`, `tests/messages.test.ts`.
- **Semester presets for period times.** A select such as "HK1 2026–2027 (mặc định)", in case HCMUT changes the bell schedule; store the preset id.
  - Files: `src/lib/export/periods.ts` (`PERIOD_TIMES` → map of presets), `src/lib/export/ics.ts`, `src/components/ExportPanel.tsx`, `src/app/storage.ts`, `tests/ics.test.ts`.
- **Seat-availability warnings.** A "sắp đầy" badge (e.g. ≥ 90% of capacity) in steps 2, 4 and 5, and a banner when a registered group is already full in the latest paste.
  - Files: `src/lib/view/format.ts` (`isFull` → add `isAlmostFull`), `src/components/CoursePreview.tsx`, `PickList.tsx`, `Checklist.tsx`.
- **Treat sessionless groups as invalid in the solver** (currently only warned).
  - Files: `src/lib/solver/filter.ts:applyHardRules`, `src/lib/solver/solve.ts` (diagnostic), solver tests.
- **Classify single-week theory sessions properly** (e.g. treat a single week as theory unless the course has other labs).
  - Files: `src/lib/parser/parse.ts:detectKind`, `tests/parser.test.ts`.

### Medium (days)
- **Share a schedule via URL.** Encode the selected group keys (and optionally prefs) in the URL hash: no server, privacy preserved. On load, offer to lock those groups.
  - Files: new `src/app/share.ts`, `src/App.tsx`, `src/components/Checklist.tsx` ("Sao chép liên kết"), `src/app/state.ts`.
- **Travel time between campuses.** CS1 ↔ CS2 takes about an hour, so it needs a constraint that forbids or penalizes a campus switch between adjacent periods on the same day. It is a stronger version of `noCampusSwitch`. It needs per-cell campus bits, which `GroupFeatures.cellCampus1/2` already provide.
  - Files: `src/lib/solver/types.ts` (`Preferences`, `CONSTRAINTS` or weights), `score.ts` (both `timeMetrics` and `createState`, kept bit-identical), `src/components/PreferencesForm.tsx`, `src/lib/view/format.ts:ITEM_LABELS`, `solver/README.md`, brute-force tests.
- **Committed browser e2e tests.** Playwright as a devDependency: the flows at 375/1280 px, keyboard walk, downloads, and the production build under `vite preview`.
  - Files: new `tests/e2e/`, `package.json`, `.github/workflows/ci.yml`.
- **Automated mutation testing** (e.g. Stryker as a devDependency) for `src/lib/**`.
  - Files: `package.json`, a new config.
- **Solver progress and cancel granularity.** Post progress every N nodes from the worker, and show nodes/s and a real cancel.
  - Files: `src/lib/solver/search.ts` (callback), `protocol.ts`, `worker.ts`, `src/app/useSolver.ts`, `StatusBanner.tsx`.

### Large (a week or more)
- **Multi-semester support.** Namespace the storage per semester (`tkb:v1` → `tkb:v2:<term>` with a migration) and add a semester picker; keep old data.
  - Files: `src/app/storage.ts`, `src/app/state.ts`, `src/App.tsx`, `tests/storage.test.ts`.
- **PWA / offline.** A web manifest plus a service worker that pre-caches `dist/` (the app is fully client-side already).
  - Files: `index.html`, new `public/manifest.webmanifest`, a new service-worker source (hand-written, or a Vite plugin as a devDependency), `vite.config.ts` (the app is served at `/`, so the scope is the root).
- **Smarter search for 8+ courses** (see §8 lever 5): forward checking is done, but 8 courses with nothing required still exceed `maxNodes`. Candidates: dynamic MRV on the live-set sizes (changes the leaf order, so truncated results change), or a sound bound for branch & bound.
  - Files: `src/lib/solver/search.ts`, `solver/README.md`.
- **Registration-result page parser.** Explicitly out of scope today, and needs real copied fixtures first.
  - Files: `src/lib/parser/` (a second entry point), `src/app/pastes.ts`.

---

## 11. Working agreement for whoever continues

This is the process that produced the repo. Keep it unless the owner says otherwise.

1. **One phase per prompt.** Each prompt names its scope and its "DO NOT" list. Do only that scope, and do not start the next phase, even if it looks easy. **STOP at the end.**
2. **Stop and report.** The report covers:
   - files created or changed;
   - test results (counts);
   - any library bug found, with the test that pins it;
   - decisions and deviations from the prompt, each with its reason;
   - anything that could not be satisfied.
   The human reviews the report and writes the next prompt from it.
3. **Never invent data.** Fixtures are real copied text. Derived edge cases are minimal, commented edits of a real fixture. If a test's expected value contradicts the fixture, the test is wrong.
4. **Library code never throws on user input.** Return warnings or diagnostics with codes instead. Keep `src/lib/**` pure: no DOM, no React.
5. **Do not change behavior outside the scope.** If you find a real bug in an earlier phase's code, fix it minimally, add a test, and report it. Examples: the Phase 6 `ROOM` regex, and the Phase 3 summary-row regex fix.
6. **No new runtime dependencies.** devDependencies only when justified in the report.
7. **Gate before reporting.** `npm test && npx tsc -b && npm run lint && npm run build` must be clean; use the PowerShell equivalent in §7. For UI work, also run the app in a real browser at 375 px and ≥ 1024 px with all fixtures, and look at the screenshots.
8. **Commit per phase** with the exact message the prompt gives, on `main`. Push only when the prompt says so; otherwise the owner pushes. (No deploy runs from GitHub Actions any more; see §9 for Vercel.)
9. **Safety check first.** `git rev-parse --show-toplevel` must be this project and `git status` must be clean, otherwise stop and ask. Earlier in this project the git root was the home directory, and committing there would have been wrong.
10. **Keep SPEC.md honest.** When a phase's decision changes the product, update SPEC.md in that phase and link to it from here. Record the *why* in §6 of this file.
11. **UI conventions:**
    - Vietnamese text; mobile-first; Catppuccin Mocha through the `ctp-*` tokens in `src/index.css`.
    - Reuse `src/components/ui.tsx` (`Button`, `ToggleButton`, `Card`, `Badge`, icons, `Toast`).
    - Every control needs a visible focus ring and an accessible name that starts with its visible label.
    - Contrast is tested; add new color pairs to `tests/contrast.test.ts`.
