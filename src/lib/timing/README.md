# Timing (Phase 2)

This module turns parsed groups into **time bitmasks** and checks whether two
groups clash. Everything here is pure: no DOM, no React, no mutation of the
Phase 1 objects.

```ts
import { parse } from "../parser";
import { buildMasks, conflicts, conflictSummary } from "../timing";

const { courses } = parse(pastedText);
const { courses: indexed, warnings } = buildMasks(courses);
const [a, b] = indexed[0].groups;
conflicts(a, b);        // boolean
conflictSummary(a, b);  // [{ day, periods, weeks }] for UI explanations
```

Tests: [`tests/timing.test.ts`](../../../tests/timing.test.ts).

## Conflict rule

Two sessions conflict **only if** all three hold:

1. same day, **and**
2. at least one shared period, **and**
3. at least one shared week.

Labs meet every other week, so two labs in the same room at the same time can
still be compatible. From `tests/fixtures/CO2007.txt`:

| Group | Day | Periods | Weeks |
|---|---|---|---|
| A01_A01 lab | Thứ 2 | 8–12 | 6, 10, 12, 14 |
| CC01_CC01 lab | Thứ 2 | 8–12 | 7, 9, 11, 13 |
| L02_L04 lab | Thứ 2 | 8–12 | 6, 10, 12, 14 |

- A01_A01 and CC01_CC01 **do not conflict**: same day and periods, but no shared week.
- A01_A01 and L02_L04 **conflict** on 5 periods × 4 weeks = 20 slots.

A day/period check alone would wrongly reject the first pair. That is why the
mask includes the week.

## Mask layout

One bit per (week, day, period) slot, stored in a `Uint32Array`
(`TimeMask`). Constants are in [`constants.ts`](./constants.ts):

| Constant | Value | Meaning |
|---|---|---|
| `MAX_WEEK` | 30 | weeks 1..30 (weeks strings are 30 characters long) |
| `DAYS` | 7 | day 2..8 (Thứ 2..Chủ nhật) → dayIndex 0..6 |
| `PERIODS` | 16 | periods (tiết) 1..16 |
| `TOTAL_BITS` | 3360 | 30 × 7 × 16 |
| `MASK_WORDS` | 105 | `Math.ceil(3360 / 32)` |

```
bit = ((week - 1) * DAYS + (day - 2)) * PERIODS + (period - 1)
word = bit >>> 5,  bit in word = bit & 31
```

The layout is week-major: the first 112 bits (3.5 words) cover week 1, the next 112
cover week 2, and so on. Scanning bits in order therefore gives slots sorted by
week, then day, then period.

Examples: (week 1, Thứ 2, tiết 1) → bit 0; (week 2, Thứ 2, tiết 1) → bit 112;
(week 30, Chủ nhật, tiết 16) → bit 3359, the top bit of word 104.

With this layout, a conflict check is a word-by-word AND:

```ts
conflicts(a, b) === intersects(a.mask, b.mask) // stops at the first overlapping word
```

## API

**[`mask.ts`](./mask.ts)**: low-level mask operations.

| Function | Description |
|---|---|
| `emptyMask()` | a new mask with no slot set |
| `setSlot(mask, week, day, period)` | sets one slot; returns `false` without throwing if the slot is out of range |
| `hasSlot(mask, week, day, period)` | `true` if the slot is set; `false` if unset or out of range |
| `orInto(target, source)` | `target \|= source` (mutates `target`) |
| `intersects(a, b)` | `true` if the masks share any slot |
| `intersection(a, b)` | a new mask of the shared slots |
| `popcount(mask)` | number of set slots |
| `slots(mask)` | decodes the set slots, sorted by week, day, period |

**[`build.ts`](./build.ts)**

- `buildSessionMask(session)` returns `{ mask, outOfRange }`. `outOfRange`
  counts the slots that were skipped.
- `buildMasks(courses)` returns `{ courses: IndexedCourse[], warnings }`. Each
  `IndexedGroup` has a unique `key` of the form `"CO2007:A01_A01"`, the original
  `group` object, and `mask`, which is the union of its sessions.

**[`conflicts.ts`](./conflicts.ts)**

- `conflicts(a, b)` takes two `IndexedGroup`s.
- `conflictSlots(a, b)` and `conflictSummary(a, b)` accept an `IndexedGroup`
  or a bare `TimeMask`, such as one session's mask or a partial timetable.
  `conflictSummary` groups the overlapping slots by day and by identical period
  set. For example, `[{ day: 2, periods: [2, 3], weeks: [1..7, 9..16] }]` means
  the two overlap on Thứ 2, periods 2–3, in those weeks.

## Warnings

`buildMasks` never throws. It returns `TimeWarning { courseCode, groupId, message }` when:

- **A session has slots outside weeks 1–30 or periods 1–16.** Those slots are
  skipped, with one warning per session (not per slot).
- **Two sessions of the same group overlap each other** ("internal overlap").
  The mask is still built.
- **A course code or a group id within a course appears again.** The later
  occurrence wins: a re-pasted course replaces the old one at the old one's
  position, so keys stay unique. For a course-level warning, `groupId` is `""`.
