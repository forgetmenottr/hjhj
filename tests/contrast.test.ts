import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSE_ACCENTS, hexToRgb, MOCHA } from "../src/lib/view/palette";

// WCAG 2.2 contrast of the text / background pairs the components actually use
// (class names in the comments). Colors come from the @theme block of
// src/index.css, so a token edit is re-checked here. Translucent backgrounds
// (bg-ctp-red/15) are composited over the surface they sit on, and course
// blocks use the same color-mix(in oklab, accent 18%, mantle) as the CSS.

const HERE = import.meta.url.startsWith("file:") ? new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") : __dirname;
const CSS = readFileSync(join(HERE, "..", "src", "index.css"), "utf8");
const THEME = CSS.slice(CSS.indexOf("@theme"), CSS.indexOf("}", CSS.indexOf("@theme")));
const TOKENS: Record<string, string> = Object.fromEntries([...THEME.matchAll(/--color-ctp-([a-z0-9]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));

type RGB = [number, number, number];
const token = (name: string): RGB => {
  if (!TOKENS[name]) throw new Error(`no token ${name}`);
  return hexToRgb(TOKENS[name]);
};

/** `color` at `alpha` over `under` (sRGB, like the browser). */
const over = (color: RGB, alpha: number, under: RGB): RGB => color.map((c, i) => c * alpha + under[i] * (1 - alpha)) as RGB;

const toLinear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab([r, g, b]: RGB): RGB {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function fromOklab([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return rgb.map((c) => Math.min(255, Math.max(0, fromLinear(c)))) as RGB;
}

/** color-mix(in oklab, a p, b). */
const mixOklab = (a: RGB, p: number, b: RGB): RGB => {
  const [x, y] = [toOklab(a), toOklab(b)];
  return fromOklab(x.map((v, i) => v * p + y[i] * (1 - p)) as RGB);
};

const luminance = (rgb: RGB) => {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const base = token("base");
const mantle = token("mantle");
const surface0 = token("surface0");
const text = token("text");
const subtext = token("subtext");
const crust = token("crust");
/** .course-block background for accent `name`. */
const block = (name: string) => mixOklab(token(name), 0.18, mantle);

/** [label, foreground, background] with the minimum ratio. */
type Pair = [string, RGB, RGB];

const NORMAL_TEXT: Pair[] = [
  ["text on base (page)", text, base],
  ["text on mantle (cards)", text, mantle],
  ["text on surface0 (secondary buttons, chips)", text, surface0],
  ["text on surface1 (hover, done step)", text, token("surface1")],
  ["text on surface2 (checked “Tắt”)", text, token("surface2")],
  ["subtext on base", subtext, base],
  ["subtext on mantle", subtext, mantle],
  ["subtext on surface0", subtext, surface0],
  ["subtext on surface0/60 over mantle (course chips)", subtext, over(surface0, 0.6, mantle)],
  ["disabled button: subtext on surface0 — was on surface1, 4.1:1", subtext, surface0],
  ["week chip without classes, placeholders: subtext on base — was subtext/70, 4.3:1", subtext, base],
  ["primary button: crust on mauve", crust, token("mauve")],
  ["primary hover: crust on lavender", crust, token("lavender")],
  ["“Bắt buộc”: crust on peach", crust, token("peach")],
  ["“Ưu tiên”: crust on blue", crust, token("blue")],
  ["“Đã đăng ký” checked: crust on green", crust, token("green")],
  ["toast: base on text", base, text],
  ["danger / red text on mantle", token("red"), mantle],
  ["green notice on mantle", token("green"), mantle],
  ["yellow notice on mantle", token("yellow"), mantle],
  ["peach text on mantle", token("peach"), mantle],
  ["peach tab label on surface0", token("peach"), surface0],
  ["mauve text on mantle", token("mauve"), mantle],
  ["blue text on mantle", token("blue"), mantle],
];

// Badges (bg-ctp-X/15 text-ctp-X) inside cards, and tinted boxes / banners.
for (const name of ["red", "yellow", "green", "blue", "peach", "mauve"]) {
  NORMAL_TEXT.push([`badge ${name}: ${name} on ${name}/15 over mantle`, token(name), over(token(name), 0.15, mantle)]);
}
for (const name of ["green", "peach", "red", "yellow", "blue"]) {
  NORMAL_TEXT.push([`box ${name}/10 over mantle: text`, text, over(token(name), 0.1, mantle)]);
  NORMAL_TEXT.push([`box ${name}/10 over mantle: subtext`, subtext, over(token(name), 0.1, mantle)]);
  NORMAL_TEXT.push([`banner ${name}/10 over base: text`, text, over(token(name), 0.1, base)]);
  NORMAL_TEXT.push([`box ${name}/10 over mantle: ${name} title`, token(name), over(token(name), 0.1, mantle)]);
}
NORMAL_TEXT.push(["selection chip: text on mauve/15 over mantle", text, over(token("mauve"), 0.15, mantle)]);

// Course blocks (grid, day list): code, room line (text/90), week label, TN / Khoá badge.
for (const name of COURSE_ACCENTS) {
  NORMAL_TEXT.push([`course block ${name}: text`, text, block(name)]);
  NORMAL_TEXT.push([`course block ${name}: room line text/90`, over(text, 0.9, block(name)), block(name)]);
  NORMAL_TEXT.push([`course block ${name}: TN / Khoá badge`, text, over(crust, 0.6, block(name))]);
}

/** UI component boundaries and graphics (WCAG 1.4.11): ≥ 3:1 against what is next to them. */
const NON_TEXT: Pair[] = [
  ["input border (overlay1) on base — was surface1, 1.8:1", token("overlay1"), base],
  ["input border (overlay1) on mantle", token("overlay1"), mantle],
  ["focus ring (lavender) on base", token("lavender"), base],
  ["focus ring (lavender) on mantle", token("lavender"), mantle],
  ["progress bar green on its surface0 track", token("green"), surface0],
];
for (const name of COURSE_ACCENTS) NON_TEXT.push([`course color ${name} (dot, border) on mantle`, token(name), mantle]);

// Print ("In"): the @media print block swaps the same tokens to Catppuccin Latte.
const PRINT_BLOCK = CSS.slice(CSS.indexOf("@media print"));
const PRINT: Record<string, string> = Object.fromEntries([...PRINT_BLOCK.matchAll(/--color-ctp-([a-z0-9]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
const printToken = (name: string): RGB => hexToRgb(PRINT[name]);

describe("print colors (Latte)", () => {
  it("override every theme token", () => {
    expect(Object.keys(PRINT).sort()).toEqual(Object.keys(TOKENS).sort());
  });

  it("keep text readable on paper and on every course block", () => {
    const paper = printToken("base");
    expect(contrast(printToken("text"), paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(printToken("subtext"), paper)).toBeGreaterThanOrEqual(4.5);
    for (const name of COURSE_ACCENTS) {
      const background = mixOklab(printToken(name), 0.18, printToken("mantle"));
      expect(contrast(printToken("text"), background), name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("theme tokens", () => {
  it("are read from src/index.css and match the canvas palette", () => {
    for (const [name, hex] of Object.entries(MOCHA)) expect(TOKENS[name], name).toBe(hex);
  });
});

describe("WCAG contrast", () => {
  it.each(NORMAL_TEXT)("%s ≥ 4.5:1", (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT)("%s ≥ 3:1", (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it("large text (h1, the group id on a done row) ≥ 3:1", () => {
    expect(contrast(text, base)).toBeGreaterThanOrEqual(3);
    expect(contrast(text, over(token("green"), 0.1, mantle))).toBeGreaterThanOrEqual(3);
  });

  it("the contrast formula matches known values", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 2);
  });
});
