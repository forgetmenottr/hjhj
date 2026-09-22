import type { ImageItem, ImageLayout } from "../lib/export/image";

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** The text, shortened with "…" until it fits `maxWidth`. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars = chars.slice(0, -1);
  return `${chars.join("")}…`;
}

function draw(ctx: CanvasRenderingContext2D, item: ImageItem): void {
  if (item.kind === "rect") {
    ctx.fillStyle = item.fill;
    ctx.beginPath();
    ctx.roundRect(item.x, item.y, item.w, item.h, item.radius);
    ctx.fill();
  } else if (item.kind === "circle") {
    ctx.fillStyle = item.fill;
    ctx.beginPath();
    ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.font = `${item.bold ? 700 : 400} ${item.size}px ${FONT}`;
    ctx.fillStyle = item.color;
    ctx.textAlign = item.align;
    ctx.textBaseline = "top";
    ctx.fillText(fit(ctx, item.text, item.maxWidth), item.x, item.y);
  }
}

/** Draws the layout on a canvas and encodes it as PNG. Null if the browser cannot. */
export async function renderPng(layout: ImageLayout): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = layout.background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const item of layout.items) draw(ctx, item);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
