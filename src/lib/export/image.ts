import { campusLabel, DAY_LONG } from "../view/format";
import { assignLanes, periodRange, usedDays, weekLabel, type GridBlock } from "../view/grid";
import { accentOf, MOCHA, mixHex } from "../view/palette";

// Layout of the PNG export: pure data (rectangles, circles, texts in canvas
// pixels), drawn by src/app/imageExport.ts. 1080 px wide so it is readable
// when shared to and viewed on a phone.

export type ImageItem =
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill: string; radius: number }
  | { kind: "circle"; x: number; y: number; r: number; fill: string }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      bold: boolean;
      color: string;
      /** The renderer shortens the text with "…" to fit. */
      maxWidth: number;
      align: "left" | "center" | "right";
    };

export interface ImageLayout {
  width: number;
  height: number;
  background: string;
  items: ImageItem[];
}

export interface LegendEntry {
  courseCode: string;
  groupId: string;
  name: string;
  colorIndex: number;
}

export interface ImageInput {
  /** Blocks to draw (one week, or all weeks). */
  blocks: GridBlock[];
  /** All-weeks blocks: they decide the days and periods drawn, so every week has the same frame. */
  frame: GridBlock[];
  legend: LegendEntry[];
  /** "Tất cả tuần" or "Tuần 6". */
  weekNote: string;
  /** The usual term (see standardWeeks); sessions outside it get a week label. */
  standard: number[] | null;
  isLocked?: (block: GridBlock) => boolean;
}

export const IMAGE_WIDTH = 1080;
const PAD = 48;
const AXIS = 104;
const HEADER = 52;
const ROW = 64;
const LEGEND_LINE = 46;

export function imageLayout(input: ImageInput): ImageLayout {
  const items: ImageItem[] = [];
  const text = (x: number, y: number, value: string, size: number, color: string, maxWidth: number, bold = false, align: "left" | "center" | "right" = "left") =>
    items.push({ kind: "text", x, y, text: value, size, bold, color, maxWidth, align });
  const inner = IMAGE_WIDTH - 2 * PAD;
  let y = PAD;

  text(PAD, y, "Thời khoá biểu", 52, MOCHA.text, inner, true);
  y += 68;
  text(PAD, y, input.weekNote, 30, MOCHA.subtext, inner);
  y += 56;

  for (const entry of input.legend) {
    items.push({ kind: "circle", x: PAD + 12, y: y + 17, r: 12, fill: MOCHA[accentOf(entry.colorIndex)] });
    text(PAD + 36, y, `${entry.courseCode} · ${entry.groupId}${entry.name ? ` · ${entry.name}` : ""}`, 28, MOCHA.text, inner - 36);
    y += LEGEND_LINE;
  }
  y += 24;

  const days = usedDays(input.frame);
  const range = periodRange(input.frame);
  if (!range || days.length === 0) {
    text(PAD, y, "Chưa có buổi học nào.", 28, MOCHA.subtext, inner);
    return { width: IMAGE_WIDTH, height: y + 40 + PAD, background: MOCHA.base, items };
  }

  const gridX = PAD + AXIS;
  const column = (IMAGE_WIDTH - PAD - gridX) / days.length;
  const periods = range.last - range.first + 1;
  const top = y + HEADER;
  const height = periods * ROW;
  items.push({ kind: "rect", x: PAD - 16, y: y - 16, w: inner + 32, h: HEADER + height + 32, fill: MOCHA.mantle, radius: 24 });

  days.forEach((day, i) => text(gridX + i * column + column / 2, y + 8, DAY_LONG[day], 26, MOCHA.text, column - 8, true, "center"));
  for (let p = 0; p < periods; p++) {
    text(gridX - 14, top + p * ROW + 8, `Tiết ${range.first + p}`, 22, MOCHA.subtext, AXIS - 14, false, "right");
    items.push({ kind: "rect", x: gridX, y: top + (p + 1) * ROW - 1, w: IMAGE_WIDTH - PAD - gridX, h: 2, fill: MOCHA.surface0, radius: 0 });
  }

  if (input.blocks.length === 0) {
    text(gridX + (IMAGE_WIDTH - PAD - gridX) / 2, top + height / 2 - 18, "Tuần này không có lớp", 30, MOCHA.subtext, column * days.length, false, "center");
  }

  days.forEach((day, i) => {
    for (const { block, lane, lanes } of assignLanes(input.blocks.filter((b) => b.day === day))) {
      const accent = MOCHA[accentOf(block.colorIndex)];
      const w = column / lanes;
      const x = gridX + i * column + lane * w + 3;
      const by = top + (block.startPeriod - range.first) * ROW + 3;
      const bh = (block.endPeriod - block.startPeriod + 1) * ROW - 6;
      items.push({ kind: "rect", x, y: by, w: w - 6, h: bh, fill: mixHex(accent, MOCHA.mantle, 0.22), radius: 10 });
      items.push({ kind: "rect", x, y: by, w: 8, h: bh, fill: accent, radius: 4 });
      const room = w - 30;
      // Code on its own line (a narrow column must not cut it); tags, room and weeks below, as space allows.
      text(x + 18, by + 8, block.courseCode, 26, MOCHA.text, room, true);
      const lines = [
        [block.kind === "lab" ? "TN" : "", input.isLocked?.(block) ? "Khoá" : ""].filter(Boolean).join(" · "),
        `${block.room} · ${campusLabel(block.campus)}`,
        weekLabel(block, input.standard) ?? "",
      ].filter(Boolean);
      let line = by + 42;
      for (const value of lines) {
        if (line + 26 > by + bh) break;
        text(x + 18, line, value, 22, MOCHA.text, room);
        line += 28;
      }
    }
  });

  y = top + height + 16 + 28;
  text(PAD, y, "Tạo bằng “Xếp thời khoá biểu HCMUT” — dữ liệu chỉ nằm trong trình duyệt của bạn.", 22, MOCHA.subtext, inner);
  return { width: IMAGE_WIDTH, height: y + 30 + PAD, background: MOCHA.base, items };
}
