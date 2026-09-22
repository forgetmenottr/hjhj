/** An inclusive range of periods (tiết). */
export interface PeriodRange {
  first: number;
  last: number;
}

/** Morning bucket: periods 1–6. */
export const MORNING: PeriodRange = { first: 1, last: 6 };
/** Afternoon bucket: periods 7–12. */
export const AFTERNOON: PeriodRange = { first: 7, last: 12 };
/** "Early" periods penalized by avoidEarly: 1–2. */
export const EARLY: PeriodRange = { first: 1, last: 2 };

/** Weight of a "required" constraint after it has been relaxed to a soft one. */
export const RELAX_WEIGHT = 1000;
/** User weights are clamped to 0..MAX_WEIGHT. */
export const MAX_WEIGHT = 10;
/** compactDays normalizer: idle periods per active week-day that count as "fully spread out". */
export const IDLE_PER_DAY = 11;

export const DEFAULT_TOP_K = 5;
export const DEFAULT_MAX_NODES = 5_000_000;
