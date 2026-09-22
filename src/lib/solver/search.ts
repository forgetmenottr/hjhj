import { emptyMask, intersects, type TimeMask } from "../timing";
import { compareStrings, type Candidate } from "./equivalence";
import type { Scorer } from "./score";

/** The candidates of one course; `courseIndex` is its position in the solver input. */
export interface Domain {
  courseIndex: number;
  courseCode: string;
  candidates: Candidate[];
}

/** A complete assignment; `picks[i]` belongs to input course i. */
export interface Found {
  penalty: number;
  picks: Candidate[];
}

export interface SearchResult {
  found: Found[];
  nodes: number;
  truncated: boolean;
}

/** Deterministic order: penalty ascending, then pick keys compared course by course. */
export function compareFound(a: Found, b: Found): number {
  if (a.penalty !== b.penalty) return a.penalty - b.penalty;
  for (let i = 0; i < Math.min(a.picks.length, b.picks.length); i++) {
    const order = compareStrings(a.picks[i].group.key, b.picks[i].group.key);
    if (order !== 0) return order;
  }
  return a.picks.length - b.picks.length;
}

/** MRV: fewest candidates first; ties broken by course code. */
export function orderByMrv(domains: Domain[]): Domain[] {
  return [...domains].sort(
    (a, b) => a.candidates.length - b.candidates.length || compareStrings(a.courseCode, b.courseCode),
  );
}

/** Keeps the best `k` entries, sorted by `compareFound`. */
class TopK {
  readonly items: Found[] = [];
  private readonly k: number;

  constructor(k: number) {
    this.k = k;
  }

  /** True if an entry with this penalty and these picks would be kept. */
  accepts(entry: Found): boolean {
    return this.items.length < this.k || compareFound(entry, this.items[this.items.length - 1]) < 0;
  }

  insert(entry: Found): void {
    let at = this.items.length;
    while (at > 0 && compareFound(entry, this.items[at - 1]) < 0) at--;
    this.items.splice(at, 0, entry);
    if (this.items.length > this.k) this.items.pop();
  }
}

/** target = a | b, word by word. */
function orTo(target: TimeMask, a: TimeMask, b: TimeMask): void {
  for (let i = 0; i < target.length; i++) target[i] = a[i] | b[i];
}

/**
 * Depth-first search over `domains` (already in search order), one candidate per
 * course, pruning any candidate that overlaps the running mask. A node is one
 * candidate tried at some depth; the search stops before node `maxNodes + 1`.
 */
export function search(domains: Domain[], scorer: Scorer, topK: number, maxNodes: number): SearchResult {
  const depthCount = domains.length;
  const masks = Array.from({ length: depthCount + 1 }, () => emptyMask()); // masks[d] = OR of the first d picks
  const chosen: Candidate[] = new Array(depthCount);
  const top = new TopK(topK);
  let nodes = 0;
  let truncated = false;

  function leaf(): void {
    const entry: Found = { penalty: scorer.penalty(chosen, masks[depthCount]), picks: chosen };
    if (top.accepts(entry)) top.insert({ penalty: entry.penalty, picks: chosen.slice() });
  }

  function visit(depth: number): void {
    if (depth === depthCount) return leaf();
    const { courseIndex, candidates } = domains[depth];
    for (const candidate of candidates) {
      if (nodes >= maxNodes) {
        truncated = true;
        return;
      }
      nodes++;
      if (intersects(masks[depth], candidate.features.mask)) continue;
      orTo(masks[depth + 1], masks[depth], candidate.features.mask);
      chosen[courseIndex] = candidate;
      visit(depth + 1);
      if (truncated) return;
    }
  }

  visit(0);
  return { found: top.items, nodes, truncated };
}
