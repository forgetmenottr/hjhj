import {
  buildSessionMask,
  DAYS,
  emptyMask,
  MAX_WEEK,
  orInto,
  PERIODS,
  type IndexedGroup,
  type TimeMask,
} from "../timing";
import { AFTERNOON, EARLY, IDLE_PER_DAY, MORNING, RELAX_WEIGHT, type PeriodRange } from "./constants";
import { constraintsWithMode, violates } from "./filter";
import { CONSTRAINTS, type ConstraintName, type Preferences, type ScoreItem, type Violation } from "./types";

// ---------------------------------------------------------------------------
// Per-group features (computed once per group, reused for every schedule)
// ---------------------------------------------------------------------------

export interface GroupFeatures {
  /** All slots of the group. */
  mask: TimeMask;
  /** Slots held on campus 1 / campus 2 (sessions with an unknown campus are in neither). */
  campus1: TimeMask;
  campus2: TimeMask;
  /** Constraint name → true when the group breaks it. */
  violates: Record<ConstraintName, boolean>;
}

/** A chosen group as the scorer sees it. */
export interface ScoredPick {
  courseCode: string;
  features: GroupFeatures;
}

export function groupFeatures(group: IndexedGroup, prefs: Preferences): GroupFeatures {
  const campus1 = emptyMask();
  const campus2 = emptyMask();
  for (const session of group.group.sessions) {
    if (session.campus === 1) orInto(campus1, buildSessionMask(session).mask);
    if (session.campus === 2) orInto(campus2, buildSessionMask(session).mask);
  }
  const flags = Object.fromEntries(CONSTRAINTS.map((name) => [name, violates(name, group.group, prefs)]));
  return { mask: group.mask, campus1, campus2, violates: flags as Record<ConstraintName, boolean> };
}

// ---------------------------------------------------------------------------
// Bit helpers. PERIODS (16) divides 32, so one (week, day) is exactly half a
// word of the mask: bits of periods 1..16, period 1 in the lowest bit.
// ---------------------------------------------------------------------------

const DAY_BITS = (1 << PERIODS) - 1;

/** Period bits of one (week, day); dayIndex = (week - 1) * DAYS + (day - 2). */
function dayBits(mask: TimeMask, dayIndex: number): number {
  const bit = dayIndex * PERIODS;
  return (mask[bit >>> 5] >>> (bit & 31)) & DAY_BITS;
}

/** Bits of a period range within a day, e.g. periods 1–2 → 0b11. */
function rangeBits(range: PeriodRange): number {
  return ((1 << (range.last - range.first + 1)) - 1) << (range.first - 1);
}

function bitCount(word: number): number {
  let x = word - ((word >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Periods from the first to the last class of a day, inclusive. */
function span(bits: number): number {
  const highest = 31 - Math.clz32(bits);
  const lowest = 31 - Math.clz32(bits & -bits);
  return highest - lowest + 1;
}

// ---------------------------------------------------------------------------
// Time metrics, each in [0, 1]
// ---------------------------------------------------------------------------

interface TimeMetrics {
  timeOfDay: number;
  fewerDays: number;
  compactDays: number;
  noCampusSwitch: number;
  avoidEarly: number;
}

/**
 * Scans every (week, day) of the combined schedule once. `preferredBits` is
 * null when timeOfDay is "none"; campus masks may be null to skip noCampusSwitch.
 */
function timeMetrics(
  occupied: TimeMask,
  campus1: TimeMask | null,
  campus2: TimeMask | null,
  preferredBits: number | null,
): TimeMetrics {
  const earlyBits = rangeBits(EARLY);
  let slots = 0, inPreferred = 0, early = 0;
  let activeWeeks = 0, activeWeekDays = 0, idle = 0, switches = 0;

  for (let week = 0; week < MAX_WEEK; week++) {
    let daysThisWeek = 0;
    for (let day = 0; day < DAYS; day++) {
      const index = week * DAYS + day;
      const bits = dayBits(occupied, index);
      if (bits === 0) continue;
      const count = bitCount(bits);
      daysThisWeek++;
      slots += count;
      early += bitCount(bits & earlyBits);
      if (preferredBits !== null) inPreferred += bitCount(bits & preferredBits);
      idle += span(bits) - count;
      if (campus1 && campus2 && dayBits(campus1, index) !== 0 && dayBits(campus2, index) !== 0) switches++;
    }
    if (daysThisWeek > 0) activeWeeks++;
    activeWeekDays += daysThisWeek;
  }

  return {
    timeOfDay: preferredBits === null || slots === 0 ? 0 : (slots - inPreferred) / slots,
    fewerDays: activeWeeks === 0 ? 0 : (activeWeekDays / activeWeeks - 1) / 6,
    compactDays: activeWeekDays === 0 ? 0 : Math.min(1, idle / (activeWeekDays * IDLE_PER_DAY)),
    noCampusSwitch: activeWeekDays === 0 ? 0 : switches / activeWeekDays,
    avoidEarly: slots === 0 ? 0 : early / slots,
  };
}

// ---------------------------------------------------------------------------
// Scorer
// ---------------------------------------------------------------------------

/** One weighted item. `soft` items count toward `score`; relaxed items only toward `penalty`. */
interface ItemSpec {
  item: string;
  weight: number;
  soft: boolean;
  constraint: ConstraintName | null;
}

export interface ScoreParts {
  penalty: number;
  score: number;
  breakdown: ScoreItem[];
  violations: Violation[];
}

export interface Scorer {
  /** Penalty of a full schedule; pass `combined` (OR of the pick masks) to skip recomputing it. */
  penalty(picks: readonly ScoredPick[], combined?: TimeMask): number;
  /** Penalty plus score, per-item breakdown and violated constraints. */
  explain(picks: readonly ScoredPick[]): ScoreParts;
}

/** Items in a fixed order: 5 time metrics, then preferred constraints, then relaxed ones. */
function itemSpecs(prefs: Preferences, relaxed: readonly ConstraintName[]): ItemSpec[] {
  const w = prefs.weights;
  const timeWeight = w.timeOfDay.prefer === "none" ? 0 : w.timeOfDay.weight;
  const time: ItemSpec[] = [
    { item: "timeOfDay", weight: timeWeight, soft: true, constraint: null },
    { item: "fewerDays", weight: w.fewerDays, soft: true, constraint: null },
    { item: "compactDays", weight: w.compactDays, soft: true, constraint: null },
    { item: "noCampusSwitch", weight: w.noCampusSwitch, soft: true, constraint: null },
    { item: "avoidEarly", weight: w.avoidEarly, soft: true, constraint: null },
  ];
  const preferred = constraintsWithMode(prefs, "preferred").map(
    (name): ItemSpec => ({ item: name, weight: w.preferredItems, soft: true, constraint: name }),
  );
  const relaxedItems = relaxed.map((name): ItemSpec => ({ item: name, weight: RELAX_WEIGHT, soft: false, constraint: name }));
  return [...time, ...preferred, ...relaxedItems];
}

/** Rounds away floating-point noise so equal penalties compare equal. */
function round(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

/** Builds a scorer for fixed preferences; `relaxed` constraints cost RELAX_WEIGHT × metric. */
export function createScorer(prefs: Preferences, relaxed: readonly ConstraintName[]): Scorer {
  const specs = itemSpecs(prefs, relaxed);
  const softTotal = specs.reduce((sum, s) => sum + (s.soft ? s.weight : 0), 0);
  const prefer = prefs.weights.timeOfDay.prefer;
  const preferredBits = prefer === "none" ? null : rangeBits(prefer === "morning" ? MORNING : AFTERNOON);
  const needCampus = prefs.weights.noCampusSwitch > 0;
  // Scratch buffers reused across calls.
  const occupied = emptyMask();
  const campus1 = emptyMask();
  const campus2 = emptyMask();

  /** OR of one feature mask over all picks, into `target`. */
  function combine(target: TimeMask, picks: readonly ScoredPick[], pick: (f: GroupFeatures) => TimeMask): TimeMask {
    target.fill(0);
    for (const p of picks) orInto(target, pick(p.features));
    return target;
  }

  /** Metric of every item, aligned with `specs`. */
  function metrics(picks: readonly ScoredPick[], combined: TimeMask | undefined, withCampus: boolean): number[] {
    const all = combined ?? combine(occupied, picks, (f) => f.mask);
    const c1 = withCampus ? combine(campus1, picks, (f) => f.campus1) : null;
    const c2 = withCampus ? combine(campus2, picks, (f) => f.campus2) : null;
    const time = timeMetrics(all, c1, c2, preferredBits);
    return specs.map((spec) => {
      if (spec.constraint === null) return time[spec.item as keyof TimeMetrics];
      const broken = picks.filter((p) => p.features.violates[spec.constraint!]).length;
      return picks.length === 0 ? 0 : broken / picks.length;
    });
  }

  function total(values: number[], softOnly: boolean): number {
    return specs.reduce((sum, spec, i) => sum + (softOnly && !spec.soft ? 0 : spec.weight * values[i]), 0);
  }

  return {
    penalty(picks, combined) {
      return round(total(metrics(picks, combined, needCampus), false));
    },
    explain(picks) {
      const values = metrics(picks, undefined, true);
      const soft = total(values, true);
      return {
        penalty: round(total(values, false)),
        score: softTotal === 0 ? 100 : Math.round(100 * (1 - soft / softTotal)),
        breakdown: specs.map((spec, i) => ({
          item: spec.item,
          metric: values[i],
          weight: spec.weight,
          penalty: spec.weight * values[i],
        })),
        violations: specs
          .filter((spec) => spec.constraint !== null)
          .map((spec) => ({
            item: spec.item,
            courses: picks.filter((p) => p.features.violates[spec.constraint!]).map((p) => p.courseCode),
          }))
          .filter((v) => v.courses.length > 0),
      };
    },
  };
}
