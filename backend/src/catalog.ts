import fs from 'node:fs';

export interface Test {
  id: string;
  code: string;
  name: string;
  price: number | null; // null = only sold inside a package
  status: boolean;
}
export interface Pkg {
  id: string;
  name: string;
  price: number;
  testIds: string[];
  status: boolean;
}
export interface RawCatalog {
  tests: Test[];
  packages: Pkg[];
}
export interface Catalog {
  tests: Map<string, Test>; // every test, including inactive ones
  packages: Pkg[]; // usable packages only, with cleaned testIds
  warnings: string[]; // data problems we found and worked around
}

/**
 * Turns the raw JSON into a clean catalog. Data mistakes are repaired here
 * (and reported in `warnings`) so the planner can assume clean input:
 *  - inactive packages are dropped
 *  - duplicate test ids inside a package are collapsed
 *  - unknown test ids inside a package are ignored (the rest of the package stays usable)
 *  - packages with a bad price or no valid tests are dropped
 *  - duplicate test/package ids: the first one wins
 *  - a test with an invalid price is treated as package-only (price null)
 */
export function buildCatalog(raw: RawCatalog): Catalog {
  const warnings: string[] = [];
  const tests = new Map<string, Test>();
  for (const t of raw.tests) {
    if (tests.has(t.id)) {
      warnings.push(`Test ${t.id} is defined twice; ignoring the later one.`);
      continue;
    }
    const validPrice = t.price === null || (Number.isFinite(t.price) && t.price >= 0);
    if (!validPrice) warnings.push(`Test ${t.id} has an invalid price; treating it as package-only.`);
    tests.set(t.id, { ...t, price: validPrice ? t.price : null });
  }

  const packages: Pkg[] = [];
  const seen = new Set<string>();
  for (const p of raw.packages) {
    if (seen.has(p.id)) {
      warnings.push(`Package ${p.id} is defined twice; ignoring the later one.`);
      continue;
    }
    seen.add(p.id);
    if (!p.status) continue;
    if (!Number.isFinite(p.price) || p.price < 0) {
      warnings.push(`Package ${p.id} has an invalid price; skipping it.`);
      continue;
    }
    const ids: string[] = [];
    for (const id of p.testIds) {
      if (!tests.has(id)) warnings.push(`Package ${p.id} lists unknown test ${id}; ignoring that entry.`);
      else if (ids.includes(id)) warnings.push(`Package ${p.id} lists ${id} more than once; counting it once.`);
      else ids.push(id);
    }
    if (ids.length === 0) {
      warnings.push(`Package ${p.id} has no valid tests; skipping it.`);
      continue;
    }
    packages.push({ ...p, testIds: ids });
  }
  return { tests, packages, warnings };
}

export function loadCatalog(file: string): Catalog {
  return buildCatalog(JSON.parse(fs.readFileSync(file, 'utf8')));
}
