import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { buildCatalog, type Pkg, type RawCatalog, type Test } from '../src/catalog';
import { findCheapestPlan } from '../src/planner';

const raw: RawCatalog & { examples: { request: { testIds: string[] }; expected: unknown }[] } = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../data/lab-catalog.json'), 'utf8'),
);
const real = buildCatalog(raw);
const app = createApp(real);

const T = (id: string, price: number | null = 100): Test => ({ id, code: id, name: `Test ${id}`, price, status: true });
const P = (id: string, price: number, testIds: string[], status = true): Pkg => ({ id, name: `Pkg ${id}`, price, testIds, status });
const plan = (cat: ReturnType<typeof buildCatalog>, ids: string[]) => {
  const r = findCheapestPlan(cat, ids);
  if (!r.ok) throw new Error('expected a plan');
  return r.plan;
};

describe('examples from data/lab-catalog.json', () => {
  raw.examples.forEach((ex, i) => {
    it(`example ${i + 1} (planner)`, () => {
      expect(plan(real, ex.request.testIds)).toEqual(ex.expected);
    });
    it(`example ${i + 1} (POST /api/plan)`, async () => {
      const res = await request(app).post('/api/plan').send(ex.request);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(ex.expected);
    });
  });
});

describe('catalog mistakes', () => {
  it('ignores unknown ids, duplicates and inactive packages, and reports them', () => {
    expect(real.warnings.join('\n')).toMatch(/T99/);
    expect(real.warnings.join('\n')).toMatch(/P06 lists T02 more than once/);
    expect(real.packages.find((p) => p.id === 'P10')).toBeUndefined();
    expect(real.packages.find((p) => p.id === 'P06')!.testIds.filter((t) => t === 'T02')).toHaveLength(1);
  });
  it('still uses a package that contains an unknown test id', () => {
    const p = plan(real, ['T13', 'T17']); // P12 (1000) beats 850 + 180 = 1030
    expect(p.items.map((i) => i.id)).toEqual(['P12']);
    expect(p.total).toBe(1000);
    expect(p.savings).toBe(30);
    expect(p.extraTests).toEqual([]);
  });
  it('never uses an inactive package (P10)', () => {
    const p = plan(real, ['T05', 'T14']);
    expect(p.items.map((i) => i.id)).toEqual(['T05', 'T14']);
  });
});

describe('tie-breaks', () => {
  it('prefers fewer items at equal price', () => {
    const cat = buildCatalog({ tests: [T('A'), T('B')], packages: [P('P1', 200, ['A', 'B'])] });
    expect(plan(cat, ['A', 'B']).items.map((i) => i.id)).toEqual(['P1']);
  });
  it('then prefers fewer extra tests', () => {
    const cat = buildCatalog({
      tests: [T('A'), T('B'), T('C')],
      packages: [P('P1', 200, ['A', 'B', 'C']), P('P2', 200, ['A', 'B'])],
    });
    const p = plan(cat, ['A', 'B']);
    expect(p.items.map((i) => i.id)).toEqual(['P2']);
    expect(p.extraTests).toEqual([]);
  });
  it('then prefers the alphabetically first item ids', () => {
    const cat = buildCatalog({ tests: [T('A'), T('B')], packages: [P('P2', 200, ['A', 'B']), P('P1', 200, ['A', 'B'])] });
    expect(plan(cat, ['A', 'B']).items.map((i) => i.id)).toEqual(['P1']);
  });
  it('compares whole item-id lists, not just the first one', () => {
    // {P1 + T3} and {P2 + T1} both cost 250 with 2 items and 0 extras.
    const cat = buildCatalog({
      tests: [T('T1'), T('T2'), T('T3')],
      packages: [P('P2', 150, ['T2', 'T3']), P('P1', 150, ['T1', 'T2'])],
    });
    expect(plan(cat, ['T1', 'T2', 'T3']).items.map((i) => i.id)).toEqual(['P1', 'T3']);
  });
});

describe('selection handling', () => {
  it('counts a repeated test once', async () => {
    const res = await request(app).post('/api/plan').send({ testIds: ['T02', 'T02', 'T03'] });
    expect(res.status).toBe(200);
    expect(res.body.individualTotal).toBe(570);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(['P01']);
  });
  it('reports covers in selection order', () => {
    expect(plan(real, ['T06', 'T04', 'T03', 'T02']).items[0].covers).toEqual(['T06', 'T04', 'T03', 'T02']);
  });
});

describe('errors', () => {
  const post = (body: unknown) => request(app).post('/api/plan').send(body as object);
  it('EMPTY_SELECTION for missing or empty testIds', async () => {
    for (const body of [{}, { testIds: [] }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('EMPTY_SELECTION');
    }
  });
  it('EMPTY_SELECTION for malformed JSON', async () => {
    const res = await request(app).post('/api/plan').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('EMPTY_SELECTION');
  });
  it('INVALID_TESTS lists unknown and inactive tests', async () => {
    const res = await post({ testIds: ['T02', 'T19', 'T99'] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'INVALID_TESTS', testIds: ['T19', 'T99'] });
  });
  it('INVALID_TESTS for wrong types', async () => {
    const res = await post({ testIds: ['T02', 5] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'INVALID_TESTS', testIds: ['5'] });
  });
  it('NOT_AVAILABLE when a package-only test has no usable package', async () => {
    const cat = buildCatalog({
      tests: [T('A'), T('X', null)],
      packages: [P('P1', 100, ['X'], false)],
    });
    const res = await request(createApp(cat)).post('/api/plan').send({ testIds: ['A', 'X'] });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'NOT_AVAILABLE', testIds: ['X'] });
  });
});

describe('GET endpoints', () => {
  it('/api/tests hides inactive tests but keeps package-only ones', async () => {
    const res = await request(app).get('/api/tests');
    const ids = res.body.map((t: { id: string }) => t.id);
    expect(ids).not.toContain('T19');
    expect(ids).toContain('T15');
  });
  it('/api/packages returns only usable packages', async () => {
    const res = await request(app).get('/api/packages');
    expect(res.body.map((p: { id: string }) => p.id)).not.toContain('P10');
    expect(res.body).toHaveLength(12);
  });
});

describe('performance', () => {
  it('selecting every selectable test is fast', () => {
    const ids = [...real.tests.values()].filter((t) => t.status).map((t) => t.id);
    const t0 = performance.now();
    const r = findCheapestPlan(real, ids);
    expect(r.ok).toBe(true);
    expect(performance.now() - t0).toBeLessThan(300);
  });
  it('stays fast with 40 synthetic packages', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const tests = Array.from({ length: 19 }, (_, i) => T(`T${String(i + 1).padStart(2, '0')}`, 200 + Math.floor(rnd() * 800)));
    const packages = Array.from({ length: 40 }, (_, i) => {
      const ids = tests.filter(() => rnd() < 0.3).map((t) => t.id);
      return P(`P${String(i + 1).padStart(2, '0')}`, 300 + Math.floor(rnd() * 1500), ids.length ? ids : [tests[0].id]);
    });
    const cat = buildCatalog({ tests, packages });
    const t0 = performance.now();
    expect(findCheapestPlan(cat, tests.map((t) => t.id)).ok).toBe(true);
    expect(performance.now() - t0).toBeLessThan(300);
  });
});
