# HCMUT Timetable Planner — Project Spec

## 1. Goal
A client-side web app that helps HCMUT students pick class groups for 5–6 courses during course registration. The user pastes course data copied from the HCMUT **registration page**, sets preferences, and gets the best-matching timetables. If no timetable satisfies every requirement, the app returns the closest ones and lists what was violated.

## 2. Scope
In scope:
- Parse text copied from the registration page (the ONLY supported source; the registration-result page is NOT supported).
- Hard/soft preference system with user-adjustable weights.
- Conflict-free timetable search, top-K results, relaxation when infeasible.
- Weekly timetable view, registration checklist, export (.ics / image).
Out of scope:
- Scraping or logging into the university website.
- Backend, accounts, or any server-side storage.
- Online classes (they do not exist in the source data).

## 3. Domain conventions
- Day: 2..7 = Thứ 2..Thứ 7, 8 = Chủ nhật.
- Period (tiết): 1..16. Default buckets: morning 1–6, afternoon 7–12 (configurable constants).
- Campus: 1 = CS1 (Lý Thường Kiệt), 2 = CS2 (Dĩ An).
- Weeks string: character at 0-based index i = week i+1; "-" = no class.
- Group id: "A01_A01" (theory group _ practice/lab group) or "A01" (course has no practice/lab group).
- Lab sessions: weeks are never consecutive (e.g. [6,10,12,14]); usually 5 periods.
- Two sessions conflict ONLY IF same day AND overlapping periods AND overlapping weeks.
- Summary-row BB/TC column is optional and never starts with a digit (course names may end with a number, e.g. "Giải tích 1").
- Input is NFC-normalized; NBSP = space.
- Fixtures: tests/fixtures/CO2007.txt, CO2011.txt (+ any other real *.txt there).
- Duplicates: when a course or group key appears twice, the LATER occurrence wins (a re-pasted course replaces the old one); emit a warning. The parser keeps both copies; `buildMasks()` applies this rule.

## 4. User flow
1. Paste: user pastes 5–6 courses (one at a time or all at once).
2. Preview: parsed courses/groups/sessions are shown; parse warnings are highlighted; user can delete or re-paste a course.
   Pasted text is split into one block per course (from its summary lines to the next course) and each block is stored and parsed on its own, so parse-warning line numbers are relative to that course's block, not to the whole paste.
3. Preferences: user sets requirements, marks each as Required or Preferred, adjusts weights. Saved to localStorage.
4. Results: top-5 timetables as weekly grids with a week selector, score breakdown, and violated requirements. User can lock a group and re-run.
5. Register: a checklist of group ids per course (e.g. "CO2007 → L01_L02") with a copy button. "This group is full" button excludes that group, keeps the other locked choices, and re-runs.

## 5. Data flow & modules
```
raw text ─ parse() ─► Course[] + warnings            src/lib/parser/   (Phase 1)
         ─ buildMasks() ─► groups with time bitmasks src/lib/timing/   (Phase 2)
         ─ solve(courses, prefs) ─► Schedule[]       src/lib/solver/   (Phase 3, pure; Web Worker wrapper in Phase 4)
         ─ UI                                        src/app/, src/components/, src/lib/view/ (Phase 4–6)
```
UI state (Phase 4): one reducer in `src/app/state.ts` holds pastes, prefs, the current step, the solver status and the last result. `useSolver(dispatch)` (`src/app/useSolver.ts`) returns only `{ run, cancel }`; it posts requests to the worker and reports progress, results and errors by dispatching actions, and the reducer drops responses whose request id is stale. localStorage (`tkb:v1`) keeps only the raw pastes and the preferences, never results.
Every lib module is a pure function with no DOM or React dependency, and is unit-tested.

## 6. Data model (parser output)
```ts
type Day = 2 | 3 | 4 | 5 | 6 | 7 | 8;
interface Session { day: Day; periods: number[]; room: string; campus: 1 | 2 | null;
  labField: string | null; weeks: number[]; kind: "theory" | "lab"; }
interface Group { id: string; theoryGroup: string; practiceGroup: string | null;
  registered: number; capacity: number; language: "V" | "TA" | string;
  lecturer: string | null; labLecturer: string | null; theoryClassSize: number | null;
  sessions: Session[]; }
interface Course { code: string; name: string; credits: number | null; groups: Group[]; }
interface ParseWarning { line: number; text: string; message: string; }
interface ParseResult { courses: Course[]; warnings: ParseWarning[]; }
```
Time bitmask (Phase 2): 30 weeks × 7 days × 16 periods = 3360 bits, stored as Uint32Array(105). Conflict check = bitwise AND.

## 7. Preferences
Always hard: no time conflict; exactly one group per course.
User-selectable Required/Preferred:
- Allowed campus(es); days off; language (V/TA); only groups with free seats; include/exclude lecturer; lock a specific group; exclude a specific group.
Soft only (weighted score):
- Prefer afternoon (or morning) periods; fewer days on campus; compact days (few idle periods between classes); no campus switch within one day; avoid periods 1–2.
App defaults (Phase 4): the solver's `DEFAULT_PREFERENCES` (every constraint off) are unchanged; the app starts from them with `freeSeats` set to "preferred", so the first suggestions avoid groups that are already full.
Relaxation: if any course has zero valid groups or the search finds zero schedules, convert user "Required" items into soft penalties with a very large weight, re-run, and report every relaxed/violated item.
Equivalent-group collapsing: within a course, groups with identical time masks AND identical per-session campus AND the same language, free-seats status and lecturer-avoid status score identically in every schedule. The solver searches one representative per class (lexicographically smallest id) and lists the other group keys as alternatives of the pick, so the user can register any of them.

## 8. Solver
1. Filter each course's groups by hard constraints.
2. Order courses by ascending number of remaining groups (MRV).
3. DFS/backtracking: pick one group per course; prune on bitmask conflict.
4. On a complete assignment, compute score; keep top-K (default 5) in a min-heap.
5. Optional branch & bound using an upper-bound score estimate.
6. Phase 3 `solve()` is a pure function; Phase 4 wraps it in a Web Worker so the UI shows progress and can cancel.

## 9. Tech stack
Vite + React + TypeScript, Tailwind CSS, Vitest, Web Worker, localStorage. Deploy: GitHub Pages. No runtime dependencies beyond these unless justified.

## 10. Folder structure
```
src/lib/parser/     types.ts, parse.ts, index.ts, README.md
src/lib/timing/     constants.ts, mask.ts, build.ts, conflicts.ts, index.ts, README.md
src/lib/solver/     types.ts, constants.ts, filter.ts, equivalence.ts, score.ts, search.ts, solve.ts, index.ts, README.md
                    (protocol.ts, worker.ts: Phase 4)
src/lib/view/       pure display helpers (grid blocks, labels)
src/app/            reducer state, storage, paste splitting, useSolver hook
src/components/     PasteInput, CoursePreview, PreferencesForm, TimetableGrid, ResultTabs, Checklist, ...
src/App.tsx         App flow (Paste → Preview → Preferences → Results)
tests/              *.test.ts
tests/fixtures/     real text copied from the registration page (never hand-typed or invented)
```

## 11. Phases & acceptance criteria
| Phase | Deliverable | Done when |
|---|---|---|
| 1 | parse() | Tests pass on real fixtures (CO2007 with labs, CO2011 without practice groups) and derived edge cases |
| 2 | buildMasks(), conflicts() | Tests prove alternating-week labs at the same time do NOT conflict |
| 3 | pure solve() | Tests on course sets built from the fixtures match a brute-force reference; relaxation reports violations |
| 4 | UI steps 1–4 + Web Worker wrapper for solve() | End-to-end run on real pasted data |
| 5 | Lock, week selector, "group full" re-run | All flows in section 4 work |
| 6 | Checklist, export, user testing | v1.0 deployed |

## 12. Rules for contributors (including AI agents)
- Work one phase at a time; stop and report when a phase is done.
- Never invent sample data; use tests/fixtures.
- Library code must never throw on user input; return warnings instead.
- Keep functions small, typed, and commented.