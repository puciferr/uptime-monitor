import fs from 'node:fs';
import path from 'node:path';
import { openDb, pruneOldChecks } from './db.js';
import { runChecksOnce } from './checker.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3000);
const DB_PATH = process.env.DB_PATH ?? './data/uptime.db';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';
const CHECK_INTERVAL_MS = 60_000;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);

const app = createApp(db, { adminPassword: ADMIN_PASSWORD });
app.listen(PORT, () => {
  console.log(`Uptime monitor beží na http://localhost:${PORT}`);
});

runChecksOnce(db);
setInterval(() => runChecksOnce(db), CHECK_INTERVAL_MS);

pruneOldChecks(db);
setInterval(() => pruneOldChecks(db), PRUNE_INTERVAL_MS);
