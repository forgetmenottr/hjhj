import { intersects } from "../timing";
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

/**
 * Pairwise conflicts between the candidates of two domains, computed once:
 * `table[j][i]` (i < j) has a 1 at `a * candidates_j + b` when candidate `a` of
 * domain i shares a slot with candidate `b` of domain j.
 */
export function conflictTable(domains: Domain[]): Uint8Array[][] {
  return domains.map((later, j) =>
    domains.slice(0, j).map((earlier) => {
      const width = later.candidates.length;
      const table = new Uint8Array(earlier.candidates.length * width);
      earlier.candidates.forEach((a, row) => {
        later.candidates.forEach((b, column) => {
          if (intersects(a.features.mask, b.features.mask)) table[row * width + column] = 1;
        });
      });
      return table;
    }),
  );
}

/**
 * Depth-first search over `domains` (already in search order), one candidate per
 * course, skipping any candidate that shares a slot with a pick above it (looked
 * up in `conflictTable`). A node is one candidate tried at some depth; the search
 * stops before node `maxNodes + 1`. Complete assignments are scored
 * incrementally (`Scorer.start`), with the same penalties as `Scorer.penalty`.
 */
export function search(domains: Domain[], scorer: Scorer, topK: number, maxNodes: number): SearchResult {
  const depthCount = domains.length;
  const table = conflictTable(domains);
  const pickedIndex = new Int32Array(depthCount); // candidate index chosen at each depth
  const chosen: Candidate[] = new Array(depthCount); // by course index (input order)
  const state = scorer.start();
  const top = new TopK(topK);
  let nodes = 0;
  let truncated = false;

  function leaf(penalty: number): void {
    const entry: Found = { penalty, picks: chosen };
    if (top.accepts(entry)) top.insert({ penalty, picks: chosen.slice() });
  }

  /** True if candidate `index` of `depth` overlaps a pick at a smaller depth. */
  function clashes(depth: number, index: number, width: number): boolean {
    const rows = table[depth];
    for (let above = 0; above < depth; above++) {
      if (rows[above][pickedIndex[above] * width + index] === 1) return true;
    }
    return false;
  }

  function visit(depth: number): void {
    const { courseIndex, candidates } = domains[depth];
    const width = candidates.length;
    const last = depth === depthCount - 1;
    for (let index = 0; index < width; index++) {
      if (nodes >= maxNodes) {
        truncated = true;
        return;
      }
      nodes++;
      if (clashes(depth, index, width)) continue;
      const candidate = candidates[index];
      chosen[courseIndex] = candidate;
      if (last) {
        leaf(state.penaltyWith(candidate));
        continue;
      }
      pickedIndex[depth] = index;
      state.push(candidate);
      visit(depth + 1);
      state.pop(candidate);
      if (truncated) return;
    }
  }

  if (depthCount === 0) leaf(state.penaltyWith(null));
  else visit(0);
  return { found: top.items, nodes, truncated };
}
