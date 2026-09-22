/** Clock time of one period (tiết), "HH:MM". */
export interface PeriodTime {
  start: string;
  end: string;
}

/** Number of periods in a day. */
export const PERIOD_COUNT = 16;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * HCMUT period times: period n starts at (n + 5):00 and lasts 50 minutes,
 * so period 1 = 06:00–06:50 and period 16 = 21:00–21:50.
 */
export const PERIOD_TIMES: Readonly<Record<number, PeriodTime>> = Object.fromEntries(
  Array.from({ length: PERIOD_COUNT }, (_, i) => {
    const hour = pad(i + 1 + 5);
    return [i + 1, { start: `${hour}:00`, end: `${hour}:50` }];
  }),
);
