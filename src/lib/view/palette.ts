/**
 * Catppuccin Mocha, as in src/index.css (the CSS is what the page uses; this
 * copy is for the PNG export, which draws on a canvas without CSS).
 */
export const MOCHA = {
  crust: "#11111b",
  mantle: "#181825",
  base: "#1e1e2e",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  overlay1: "#7f849c",
  subtext: "#a6adc8",
  text: "#cdd6f4",
  mauve: "#cba6f7",
  blue: "#89b4fa",
  green: "#a6e3a1",
  peach: "#fab387",
  red: "#f38ba8",
  yellow: "#f9e2af",
  teal: "#94e2d5",
  pink: "#f5c2e7",
  sky: "#89dceb",
  lavender: "#b4befe",
} as const;

/** Accents used for courses, in order (a course keeps its color by pick index). */
export const COURSE_ACCENTS = ["mauve", "blue", "green", "peach", "red", "yellow", "teal", "pink", "sky", "lavender"] as const;

export function accentOf(index: number): (typeof COURSE_ACCENTS)[number] {
  return COURSE_ACCENTS[((index % COURSE_ACCENTS.length) + COURSE_ACCENTS.length) % COURSE_ACCENTS.length];
}

/** "#rrggbb" → [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `amount` of `top` over `bottom`, mixed in sRGB (for the canvas). */
export function mixHex(top: string, bottom: string, amount: number): string {
  const a = hexToRgb(top);
  const b = hexToRgb(bottom);
  return `#${a.map((v, i) => Math.round(v * amount + b[i] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}
