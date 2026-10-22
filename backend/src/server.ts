import path from 'node:path';
import { createApp } from './app';
import { loadCatalog } from './catalog';

const file = process.env.CATALOG_PATH ?? path.resolve(__dirname, '../data/lab-catalog.json');
const catalog = loadCatalog(file);
for (const w of catalog.warnings) console.warn(`[catalog] ${w}`);

const port = Number(process.env.PORT ?? 3000);
createApp(catalog).listen(port, () => console.log(`API listening on http://localhost:${port}`));
