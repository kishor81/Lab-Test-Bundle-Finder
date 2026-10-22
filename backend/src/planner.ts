import type { Catalog } from './catalog';

export interface PlanItem {
  type: 'package' | 'test';
  id: string;
  name: string;
  price: number;
  covers: string[]; // selected tests this item covers, in selection order
}
export interface Plan {
  items: PlanItem[];
  total: number;
  extraTests: string[];
  individualTotal: number | null;
  savings: number | null;
}
export type PlanResult =
  | { ok: true; plan: Plan }
  | { ok: false; error: 'NOT_AVAILABLE'; testIds: string[] };

interface Option {
  type: 'package' | 'test';
  id: string;
  name: string;
  price: number;
  covers: number[]; // indexes into the selection, ascending
  extras: string[]; // included tests that were not selected
}
interface Candidate {
  options: Option[];
  total: number;
  extraCount: number;
  ids: string[]; // sorted item ids, used for the final tie-break
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Negative when a is better than b: total, then fewer items, then fewer extras, then ids. */
function compare(a: Candidate, b: Candidate): number {
  if (a.total !== b.total) return a.total - b.total;
  if (a.options.length !== b.options.length) return a.options.length - b.options.length;
  if (a.extraCount !== b.extraCount) return a.extraCount - b.extraCount;
  for (let i = 0; i < a.ids.length; i++) {
    const c = cmp(a.ids[i], b.ids[i]);
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * Cheapest way to cover `selection` (ids already validated as known + active).
 *
 * Exact search: take the first uncovered test and try every item (package or
 * single test) that covers it. Every valid plan is reachable this way, so the
 * best one under the tie-break rules is found. Branches are cut when
 *   cost so far + lower bound for what is left  >  best total found.
 * The lower bound splits each item's price evenly over the selected tests it
 * covers; every uncovered test needs at least its cheapest such share.
 */
export function findCheapestPlan(catalog: Catalog, selection: string[]): PlanResult {
  const sel = [...new Set(selection)]; // rule 5: duplicates count once
  const index = new Map(sel.map((id, i) => [id, i]));

  const options: Option[] = [];
  for (const p of catalog.packages) {
    const covers: number[] = [];
    const extras: string[] = [];
    for (const id of p.testIds) {
      const i = index.get(id);
      if (i === undefined) extras.push(id);
      else covers.push(i);
    }
    if (covers.length > 0) {
      options.push({ type: 'package', id: p.id, name: p.name, price: p.price, covers: covers.sort((a, b) => a - b), extras });
    }
  }
  for (const id of sel) {
    const t = catalog.tests.get(id)!;
    if (t.price !== null) {
      options.push({ type: 'test', id, name: t.name, price: t.price, covers: [index.get(id)!], extras: [] });
    }
  }

  const byTest: Option[][] = sel.map(() => []);
  for (const o of options) for (const c of o.covers) byTest[c].push(o);

  const missing = sel.filter((_, i) => byTest[i].length === 0);
  if (missing.length > 0) return { ok: false, error: 'NOT_AVAILABLE', testIds: missing };

  const minShare = byTest.map((list) => Math.min(...list.map((o) => o.price / o.covers.length)));
  for (const list of byTest) list.sort((a, b) => a.price - b.price || cmp(a.id, b.id));

  const covered = new Array<number>(sel.length).fill(0);
  const chosen: Option[] = [];
  let best: Candidate | null = null;

  const evaluate = (cost: number) => {
    const extras = new Set<string>();
    for (const o of chosen) for (const e of o.extras) extras.add(e);
    const cand: Candidate = {
      options: [...chosen],
      total: cost,
      extraCount: extras.size,
      ids: chosen.map((o) => o.id).sort(cmp),
    };
    if (best === null || compare(cand, best) < 0) best = cand;
  };

  const dfs = (cost: number) => {
    const next = covered.indexOf(0);
    if (next === -1) return evaluate(cost);
    if (best !== null) {
      let bound = cost;
      for (let i = next; i < covered.length; i++) if (covered[i] === 0) bound += minShare[i];
      if (bound > best.total + 1e-9) return; // ties must still be explored
    }
    for (const o of byTest[next]) {
      chosen.push(o);
      for (const c of o.covers) covered[c]++;
      dfs(cost + o.price);
      for (const c of o.covers) covered[c]--;
      chosen.pop();
    }
  };
  dfs(0);

  const winner = best as Candidate | null;
  if (!winner) return { ok: false, error: 'NOT_AVAILABLE', testIds: sel };

  const items: PlanItem[] = [...winner.options]
    .sort((a, b) => cmp(a.id, b.id))
    .map((o) => ({ type: o.type, id: o.id, name: o.name, price: o.price, covers: o.covers.map((i) => sel[i]) }));
  const extraTests = [...new Set(winner.options.flatMap((o) => o.extras))].sort(cmp);

  const prices = sel.map((id) => catalog.tests.get(id)!.price);
  const individualTotal = prices.some((p) => p === null) ? null : (prices as number[]).reduce((s, p) => s + p, 0);

  return {
    ok: true,
    plan: {
      items,
      total: winner.total,
      extraTests,
      individualTotal,
      savings: individualTotal === null ? null : individualTotal - winner.total,
    },
  };
}
