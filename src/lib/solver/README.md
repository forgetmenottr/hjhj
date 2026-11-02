# Solver (Phase 3)

`solve(courses, prefs)` picks one group per course and returns the top-K
conflict-free schedules, best first. It is a pure function with no DOM, no
React and no Web Worker (Phase 4 wraps it in a worker). It never throws on
user input: preferences are normalized first, and failures come back as
`status` + `diagnostics`.

```ts
import { parse } from "../parser";
import { buildMasks } from "../timing";
import { DEFAULT_PREFERENCES, solve } from "../solver";

const { courses } = buildMasks(parse(text).courses);
const result = solve(courses, { ...DEFAULT_PREFERENCES, freeSeats: { mode: "required" } });
// result.status: "ok" | "relaxed" | "infeasible"
// result.schedules[0].picks → [{ courseCode, group, alternatives }, ...]
```

Tests: [`tests/solver.test.ts`](../../../tests/solver.test.ts).

## Files

| File | Role |
|---|---|
| [`types.ts`](./types.ts) | `Preferences`, `Schedule`, `SolveResult`; `DEFAULT_PREFERENCES`, `normalizePreferences` |
| [`constants.ts`](./constants.ts) | period buckets, `RELAX_WEIGHT`, `IDLE_PER_DAY`, defaults |
| [`filter.ts`](./filter.ts) | group-level constraint predicates; locked/excluded rules |
| [`equivalence.ts`](./equivalence.ts) | collapses groups that score identically |
| [`score.ts`](./score.ts) | per-group features and the scorer |
| [`search.ts`](./search.ts) | MRV-ordered DFS with mask pruning and a top-K list |
| [`solve.ts`](./solve.ts) | strict → relaxed → infeasible pipeline, diagnostics |

## Preferences

Each group-level constraint has a mode: `"off"`, `"required"` (a filter) or
`"preferred"` (a soft penalty).

Constraints, in `CONSTRAINTS` order:

| Constraint | A group violates it when |
|---|---|
| `programs` | `allowed` is not empty and the group's program track (`programOf`: the leading letters of the theory group, e.g. `L`, `CC`) is not in it |
| `campuses` | any session's campus is not in `allowed`. An unknown campus (`null`) counts as not allowed. |
| `daysOff` | any session falls on one of `days` |
| `partsOff` | any session has a period inside one of `parts`, a `{ day, part }` pair where `part` is `morning` (1–6), `afternoon` (7–12) or `evening` (13–16) (`DAY_PARTS`) |
| `language` | `group.language` is not in `allowed` (trimmed, case-insensitive) |
| `freeSeats` | `registered >= capacity` |
| `avoidLecturers` | a name in `names` appears as whole words in `lecturer` or `labLecturer`, ignoring case and diacritics (`đ` → `d`) |

`programs` with an empty `allowed` and `partsOff` with an empty `parts` filter
nothing and are never applied or relaxed, whatever their mode (`isActive`).

Some rules are **always hard** and are never relaxed:

- no two picks may share a (week, day, period) slot;
- exactly one group per course;
- `locked` (a course keeps only its locked group);
- `excluded` (the listed group keys are dropped).

Weights are clamped to 0..10, where 0 means ignore. `normalizePreferences` turns
malformed input (such as an old localStorage copy) into valid preferences:
unknown modes become `"off"`, bad lists become `[]`, and `topK` / `maxNodes`
fall back to 5 / 5,000,000.

## Algorithm

1. **Filter** ([`filter.ts`](./filter.ts)). For each course, drop excluded
   groups and, if the course is locked, keep only the locked group. Then drop
   groups that violate any active `"required"` constraint.
2. **Equivalence** ([`equivalence.ts`](./equivalence.ts)). Within a course,
   some groups score the same in every schedule: identical mask words,
   identical sessions (day, periods, weeks, campus), the same language, the
   same program flag (`violates("programs")`), the same free-seats status and
   the same lecturer-avoid status. They form one class. `daysOff` and
   `partsOff` need no place in the key: they follow from the sessions. The search uses one representative per class (the lexicographically
   smallest id), and the other keys go into `Pick.alternatives`. Filtering runs
   first, so an excluded or filtered-out group is never listed as an alternative.
3. **Search** ([`search.ts`](./search.ts)). Courses are ordered by MRV: fewest
   classes first, ties broken by course code. Before the DFS, `conflictTable`
   compares every candidate with every candidate of each other course once;
   the DFS then skips a candidate that clashes with a pick above it by table
   lookup (at most one lookup per depth) instead of comparing 105-word masks.
   - One *node* is one candidate tried at some depth. At `maxNodes` the search
     stops and sets `truncated`.
   - Each complete assignment is scored. The best `topK` are kept in a sorted
     list (penalty ascending, then pick keys compared course by course in input
     order), so the output is deterministic.
   - There is no branch & bound. Several metrics are not monotone as courses
     are added (for example, a new course can lower the average days per week),
     so a cheap admissible bound does not exist.
4. **Relaxation** ([`solve.ts`](./solve.ts)).
   - **strict**: if every course still has groups after step 1, search.
     A schedule found → `status: "ok"`.
   - **relaxed**: if a course was emptied or the strict search found nothing,
     and some active constraint is `"required"`, search again with only the hard
     rules applied. Every required constraint becomes a soft item with weight
     `RELAX_WEIGHT` (1000). `relaxed` lists them, and `diagnostics` say which
     courses had no valid group and which constraint blocked them. A course
     blocked by `programs` gets its own `course-no-program` diagnostic, which
     names the programs the course does have.
   - **infeasible**: otherwise `schedules: []`. `diagnostics` name:
     - courses emptied by locked/excluded rules (missing locked group, locked
       group excluded, every group excluded, or no groups at all);
     - pairs of locked groups that overlap, e.g. `Locked groups CO2007:A01_A01
       and CO2011:L01 overlap: Monday (Thứ 2) periods 2-3 (weeks 1-7, 9-16)`;
     - courses whose every group conflicts with a locked group;
     - a truncated search.
   - All attempts share one `maxNodes` budget, so `stats.nodes <= maxNodes`.
5. **Validation**. Before returning, every schedule is checked pairwise with
   `conflicts()`. A failing schedule is dropped with a diagnostic instead of
   throwing. This can only happen through a bug, and tests assert it never does.

## Scoring ([`score.ts`](./score.ts))

The scorer works on the union of the chosen groups' masks. A **week-day** is a
(week, day) pair. It is **active** if it has at least one class, and a **slot**
is one (week, day, period) bit. All metrics are in [0, 1], and a metric whose
denominator would be 0 is 0.

| Item | Metric |
|---|---|
| `timeOfDay` | occupied slots **not** in the preferred bucket ÷ occupied slots. The buckets are `MORNING` = periods 1–6 and `AFTERNOON` = 7–12; periods 13–16 are in neither. With `prefer: "none"` the metric is 0 and the weight counts as 0. |
| `fewerDays` | (average active days per week, over weeks with ≥ 1 class, − 1) ÷ 6 |
| `compactDays` | min(1, total idle periods ÷ (active week-days × `IDLE_PER_DAY` = 11)). Idle periods of a week-day = (last class period − first class period + 1) − occupied periods. |
| `noCampusSwitch` | active week-days with classes on both campus 1 and campus 2 ÷ active week-days. Unknown campus is ignored. |
| `avoidEarly` | occupied slots in periods 1–2 ÷ occupied slots |
| each `"preferred"` constraint | courses whose pick violates it ÷ number of courses; weight = `weights.preferredItems` |
| each relaxed constraint | same metric; weight = `RELAX_WEIGHT` (1000) |

The totals combine these items as follows:

```
penaltySoft = Σ over soft items (5 time items + preferred constraints) of weight × metric
penalty     = penaltySoft + Σ over relaxed constraints of RELAX_WEIGHT × metric
score       = Σ soft weights == 0 ? 100 : round(100 × (1 − penaltySoft / Σ soft weights))
```

Relaxed items affect only `penalty`, not `score`. `penalty` is rounded to
1e-9 so that mathematically equal penalties tie exactly, and ties then fall
back to pick keys.

`breakdown` lists every item in a fixed order: the five time items, then the
preferred constraints, then the relaxed ones. `violations` lists each
preferred or relaxed constraint that at least one pick breaks, with the course
codes that break it.

**Worked example** (from the tests): `CO2007:L01_L01` + `CO2011:CC01`.

- L01_L01 meets Tuesday 10–12 on CS2 every week, plus a Friday 8–12 lab on
  CS2 in weeks 7, 9, 11, 13. CC01 meets Friday 2–3 on CS1 every week.
- `fewerDays` = (2 − 1)/6.
- `compactDays` = 16/330: 4 idle periods on each of 4 lab Fridays, over 30
  active week-days × 11.
- `noCampusSwitch` = 4/30: the 4 lab Fridays have classes on both campuses.
- `avoidEarly` = 15/95.
- With the default weights (5, 3, 5, 3; Σ = 16) the score is 87.

### Speed

The mask layout puts one (week, day) in exactly half a 32-bit word
(16 periods). Per-group features (campus masks, constraint flags, and the
(week, day) cells the group touches) are computed once per representative.

`penalty()` / `explain()` scan all 30 × 7 cells; they are the reference. The
search instead scores incrementally (`Scorer.start()` → `ScoreState`): it keeps
the integer totals `timeMetrics` adds up (slots, early and preferred slots, the
span of each active week-day, active week-days, active weeks, campus switches,
broken constraints) and updates only the cells a pick touches on push / pop.
A leaf is scored from those totals with the same formulas and the same order
of additions, so its penalty equals `penalty()` exactly (the brute-force tests
compare them), and results are identical to a full rescan.

With the six real fixtures (CO2001, CO2003, CO2007, CO2011, SK2001, SP1031)
and the app defaults: 2,778,034 nodes and 1,278,259 complete schedules. A full
rescan per leaf took about 6.6 s; the conflict table and incremental scoring
take about 0.3–0.4 s (bundled, Node 24), with the same nodes and results.

## Diagnostics

`diagnostics` is English text. `diagnosticDetails` has the same entries, in the
same order, as `{ code, params, message }` with `code` one of
`SOLVER_DIAGNOSTIC_CODES`, so the UI can word them itself (Vietnamese).
