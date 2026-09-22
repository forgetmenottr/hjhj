import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Under the jsdom environment import.meta.url is not a file: URL, so fall back to __dirname.
const HERE = import.meta.url.startsWith("file:") ? dirname(fileURLToPath(import.meta.url)) : __dirname;
const DIR = join(HERE, "fixtures");

/** Every real fixture file in tests/fixtures/, sorted. */
export const ALL_FIXTURES = readdirSync(DIR)
  .filter((name) => name.endsWith(".txt"))
  .sort();

/** Raw text of a fixture copied from the registration page. */
export function readFixture(name: string): string {
  return readFileSync(join(DIR, name), "utf8");
}
