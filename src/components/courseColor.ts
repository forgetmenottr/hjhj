import type { CSSProperties } from "react";
import { accentOf } from "../lib/view/palette";

/** Inline style that hands accent `index` to CSS as --c (see .course-block in index.css). */
export function courseColor(index: number): CSSProperties {
  return { "--c": `var(--color-ctp-${accentOf(index)})` } as CSSProperties;
}
