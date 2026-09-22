import type { CSSProperties } from "react";

/** Catppuccin accents used for courses, in order. */
const ACCENTS = ["mauve", "blue", "green", "peach", "red", "yellow", "teal", "pink", "sky", "lavender"] as const;

/** Inline style that hands accent `index` to CSS as --c (see .course-block in index.css). */
export function courseColor(index: number): CSSProperties {
  return { "--c": `var(--color-ctp-${ACCENTS[index % ACCENTS.length]})` } as CSSProperties;
}
