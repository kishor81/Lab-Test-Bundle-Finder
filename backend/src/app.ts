import express, { type ErrorRequestHandler } from 'express';
import type { Catalog } from './catalog';
import { findCheapestPlan } from './planner';

export function createApp(catalog: Catalog) {
  const app = express();
  app.use(express.json());

  const selectable = [...catalog.tests.values()].filter((t) => t.status);

  app.get('/api/tests', (_req, res) => {
    res.json(selectable);
  });

  app.get('/api/packages', (_req, res) => {
    res.json(catalog.packages);
  });

  app.post('/api/plan', (req, res) => {
    const raw = req.body?.testIds;

    if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) {
      return res.status(400).json({ error: 'EMPTY_SELECTION', testIds: [] });
    }
    // Wrong shape (not an array of strings): report the offending values as invalid.
    if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
      const bad = Array.isArray(raw) ? raw.filter((x) => typeof x !== 'string') : [raw];
      return res.status(400).json({ error: 'INVALID_TESTS', testIds: bad.map(String) });
    }

    const ids = [...new Set<string>(raw)];
    const invalid = ids.filter((id) => !catalog.tests.get(id)?.status);
    if (invalid.length > 0) {
      return res.status(400).json({ error: 'INVALID_TESTS', testIds: invalid });
    }

    const result = findCheapestPlan(catalog, ids);
    if (!result.ok) {
      return res.status(422).json({ error: result.error, testIds: result.testIds });
    }
    return res.json(result.plan);
  });

  // Unparseable JSON behaves like "no usable selection".
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'EMPTY_SELECTION', testIds: [] });
    }
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', testIds: [] });
  };
  app.use(onError);

  return app;
}
