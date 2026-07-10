# Míľnik 1: Appka lokálne — implementačný plán

> **Režim vykonávania:** Tento plán vykonáva POUŽÍVATEĽ ručne, krok za krokom,
> s Claudom ako navigátorom (podľa feedback-teaching-style: malé kroky, kód
> píše používateľ, každý krok má viditeľný výsledok). Kroky majú checkbox
> (`- [ ]`) syntax na sledovanie postupu.
> *(Pre agentické spracovanie by platilo: superpowers:executing-plans.)*

**Cieľ:** Funkčný uptime monitor bežiaci lokálne — Express API + SQLite +
checker na pozadí + verejná status stránka s uptime % a grafom latencie.

**Architektúra:** Malé ESM moduly s jednou zodpovednosťou: `db.js` (SQLite +
všetky SQL operácie), `checker.js` (kontrola URL, testovateľná vďaka
injektovanému fetch), `app.js` (Express routy, oddelené od servera kvôli
testom), `server.js` (zapojenie všetkého + intervaly). Frontend je statické
HTML/JS bez frameworku.

**Tech stack:** Node.js ≥ 20, Express 5, better-sqlite3, `node --test`
(vstavaný test runner, žiadne ďalšie závislosti).

## Globálne obmedzenia

- Node.js ≥ 20 (kvôli vstavanému `fetch`, `node --test`, `AbortSignal.timeout`)
- ESM moduly (`"type": "module"` v package.json)
- Jediné runtime závislosti: `express`, `better-sqlite3`
- Frontend: čisté HTML/CSS/JS, žiadny framework, žiadny build krok
- Všetky SQL cez prepared statements (ochrana pred SQL injection)
- Príkazy sa spúšťajú z koreňa repa `C:\Users\patri\uptime-monitor`
- Commit po každom tasku; správy po slovensky, v rozkazovacom spôsobe

## Štruktúra súborov

```
uptime-monitor/
  package.json          — skripty start/test, ESM
  .gitignore            — node_modules, data, *.db
  src/
    db.js               — otvorenie DB, schéma, všetky SQL funkcie
    checker.js          — checkUrl + runChecksOnce (fetch injektovaný)
    app.js              — createApp(db, opts) → Express app (routy, Basic Auth)
    server.js           — zapojenie: env config, intervaly, listen
  public/
    index.html          — status stránka
    main.js             — fetch /api/monitors + render + SVG sparkline
    style.css           — vzhľad kariet
  test/
    db.test.js
    checker.test.js
    api.test.js
  data/                 — SQLite súbor (gitignorované, vznikne za behu)
```

---

### Task 0: Skeleton projektu

**Files:**
- Create: `package.json`, `.gitignore`

**Interfaces:**
- Produces: npm skripty `npm start` (spustí `src/server.js`) a `npm test`
  (spustí `node --test`); nainštalované `express` a `better-sqlite3`.

- [ ] **Krok 0.1: Over verziu Node**

Spusti: `node --version`
Očakávané: `v20.x` alebo vyššie. Ak menej/chýba, nainštaluj LTS z nodejs.org.

- [ ] **Krok 0.2: Inicializuj npm projekt a nainštaluj závislosti**

```
cd C:\Users\patri\uptime-monitor
npm init -y
npm install express better-sqlite3
```

Očakávané: vznikne `package.json`, `package-lock.json`, `node_modules/`;
výpis končí `added N packages`.

- [ ] **Krok 0.3: Uprav package.json**

Nastav (ručne v editore) tieto polia:

```json
{
  "name": "uptime-monitor",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  }
}
```

(`dependencies` nechaj tak, ako ich zapísal npm install.)

- [ ] **Krok 0.4: Vytvor .gitignore**

```
node_modules/
data/
*.db
```

- [ ] **Krok 0.5: Commit**

```
git add package.json package-lock.json .gitignore
git commit -m "Zaloz npm projekt so zavislostami express a better-sqlite3"
```

---

### Task 1: Databáza — monitory (TDD)

**Files:**
- Create: `src/db.js`, `test/db.test.js`

**Interfaces:**
- Produces:
  - `openDb(path: string) → Database` (`':memory:'` pre testy)
  - `addMonitor(db, name: string, url: string) → {id, name, url}`
  - `listMonitors(db) → Array<{id, name, url, created_at}>`
  - `deleteMonitor(db, id: number) → boolean`

- [ ] **Krok 1.1: Napíš zlyhávajúci test** — `test/db.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, addMonitor, listMonitors, deleteMonitor } from '../src/db.js';

test('addMonitor uloží monitor a listMonitors ho vráti', () => {
  const db = openDb(':memory:');
  const m = addMonitor(db, 'Google', 'https://google.com');
  const all = listMonitors(db);
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Google');
  assert.equal(all[0].url, 'https://google.com');
  assert.equal(all[0].id, m.id);
});

test('deleteMonitor zmaže monitor a vráti false pre neexistujúce id', () => {
  const db = openDb(':memory:');
  const m = addMonitor(db, 'X', 'https://x.sk');
  assert.equal(deleteMonitor(db, m.id), true);
  assert.equal(listMonitors(db).length, 0);
  assert.equal(deleteMonitor(db, 999), false);
});
```

- [ ] **Krok 1.2: Over, že test zlyhá**

Spusti: `npm test`
Očakávané: FAIL — `Cannot find module ... src/db.js`.

- [ ] **Krok 1.3: Implementuj** — `src/db.js`:

```js
import Database from 'better-sqlite3';

export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      status_code INTEGER,
      ok INTEGER NOT NULL,
      latency_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_checks_monitor_ts ON checks(monitor_id, ts);
  `);
  return db;
}

export function addMonitor(db, name, url) {
  const info = db
    .prepare('INSERT INTO monitors (name, url) VALUES (?, ?)')
    .run(name, url);
  return { id: info.lastInsertRowid, name, url };
}

export function listMonitors(db) {
  return db.prepare('SELECT * FROM monitors ORDER BY id').all();
}

export function deleteMonitor(db, id) {
  return db.prepare('DELETE FROM monitors WHERE id = ?').run(id).changes > 0;
}
```

- [ ] **Krok 1.4: Over, že testy prechádzajú**

Spusti: `npm test`
Očakávané: `pass 2`, `fail 0`.

- [ ] **Krok 1.5: Commit**

```
git add src/db.js test/db.test.js
git commit -m "Pridaj SQLite vrstvu so spravou monitorov"
```

---

### Task 2: Databáza — checky a štatistiky (TDD)

**Files:**
- Modify: `src/db.js` (pridaj funkcie na koniec)
- Modify: `test/db.test.js` (pridaj testy na koniec)

**Interfaces:**
- Produces:
  - `recordCheck(db, monitorId, {statusCode: number|null, ok: boolean, latencyMs: number}) → void`
  - `getMonitorStats(db, monitorId) → {up: boolean|null, uptime24h: number|null, latencies: number[]}`
    (`up` = stav posledného checku; `uptime24h` = % za 24 h na 1 desatinné
    miesto; `latencies` = latency_ms posledných max 60 checkov, chronologicky)
  - `pruneOldChecks(db, days = 30) → number` (počet zmazaných)

- [ ] **Krok 2.1: Napíš zlyhávajúce testy** — pridaj do `test/db.test.js`:

```js
import { recordCheck, getMonitorStats, pruneOldChecks } from '../src/db.js';

test('getMonitorStats počíta uptime a posledný stav', () => {
  const db = openDb(':memory:');
  const m = addMonitor(db, 'X', 'https://x.sk');
  recordCheck(db, m.id, { statusCode: 200, ok: true, latencyMs: 120 });
  recordCheck(db, m.id, { statusCode: 200, ok: true, latencyMs: 80 });
  recordCheck(db, m.id, { statusCode: 500, ok: false, latencyMs: 300 });
  const s = getMonitorStats(db, m.id);
  assert.equal(s.up, false);
  assert.equal(s.uptime24h, 66.7);
  assert.deepEqual(s.latencies, [120, 80, 300]);
});

test('getMonitorStats bez checkov vráti null hodnoty', () => {
  const db = openDb(':memory:');
  const m = addMonitor(db, 'X', 'https://x.sk');
  const s = getMonitorStats(db, m.id);
  assert.equal(s.up, null);
  assert.equal(s.uptime24h, null);
  assert.deepEqual(s.latencies, []);
});

test('pruneOldChecks nezmaže čerstvé checky', () => {
  const db = openDb(':memory:');
  const m = addMonitor(db, 'X', 'https://x.sk');
  recordCheck(db, m.id, { statusCode: 200, ok: true, latencyMs: 50 });
  assert.equal(pruneOldChecks(db, 30), 0);
  assert.equal(getMonitorStats(db, m.id).latencies.length, 1);
});
```

Poznámka k importom: `node:test` dovoľuje viac `import` blokov; nechaj
existujúce importy tak a tento pridaj pod ne.

- [ ] **Krok 2.2: Over zlyhanie** — `npm test` → FAIL (`recordCheck` neexistuje).

- [ ] **Krok 2.3: Implementuj** — pridaj do `src/db.js`:

```js
export function recordCheck(db, monitorId, { statusCode, ok, latencyMs }) {
  db.prepare(
    'INSERT INTO checks (monitor_id, status_code, ok, latency_ms) VALUES (?, ?, ?, ?)'
  ).run(monitorId, statusCode, ok ? 1 : 0, latencyMs);
}

export function getMonitorStats(db, monitorId) {
  const last = db
    .prepare('SELECT ok FROM checks WHERE monitor_id = ? ORDER BY id DESC LIMIT 1')
    .get(monitorId);
  const day = db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(ok), 0) AS okCount
    FROM checks WHERE monitor_id = ? AND ts >= datetime('now', '-1 day')
  `).get(monitorId);
  const recent = db.prepare(`
    SELECT latency_ms FROM (
      SELECT id, latency_ms FROM checks
      WHERE monitor_id = ? ORDER BY id DESC LIMIT 60
    ) ORDER BY id
  `).all(monitorId);
  return {
    up: last ? last.ok === 1 : null,
    uptime24h: day.total ? Math.round((day.okCount / day.total) * 1000) / 10 : null,
    latencies: recent.map(r => r.latency_ms),
  };
}

export function pruneOldChecks(db, days = 30) {
  return db
    .prepare(`DELETE FROM checks WHERE ts < datetime('now', ?)`)
    .run(`-${days} days`).changes;
}
```

- [ ] **Krok 2.4: Over** — `npm test` → `pass 5`, `fail 0`.

- [ ] **Krok 2.5: Commit**

```
git add src/db.js test/db.test.js
git commit -m "Pridaj zaznamenavanie checkov, statistiky a retenciu"
```

---

### Task 3: Checker (TDD)

**Files:**
- Create: `src/checker.js`, `test/checker.test.js`

**Interfaces:**
- Consumes: `listMonitors`, `recordCheck` z `src/db.js`
- Produces:
  - `checkUrl(url: string, fetchImpl = fetch) → Promise<{statusCode: number|null, ok: boolean, latencyMs: number}>`
  - `runChecksOnce(db, fetchImpl = fetch) → Promise<void>` (skontroluje všetky
    monitory a výsledky zapíše cez `recordCheck`)

- [ ] **Krok 3.1: Napíš zlyhávajúce testy** — `test/checker.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, addMonitor } from '../src/db.js';
import { checkUrl, runChecksOnce } from '../src/checker.js';

test('checkUrl: úspešná odpoveď', async () => {
  const fakeFetch = async () => ({ status: 200, ok: true });
  const r = await checkUrl('https://example.com', fakeFetch);
  assert.equal(r.ok, true);
  assert.equal(r.statusCode, 200);
  assert.equal(typeof r.latencyMs, 'number');
});

test('checkUrl: odpoveď 500 znamená down', async () => {
  const fakeFetch = async () => ({ status: 500, ok: false });
  const r = await checkUrl('https://example.com', fakeFetch);
  assert.equal(r.ok, false);
  assert.equal(r.statusCode, 500);
});

test('checkUrl: sieťová chyba nezhodí appku', async () => {
  const fakeFetch = async () => { throw new Error('ECONNREFUSED'); };
  const r = await checkUrl('https://example.com', fakeFetch);
  assert.equal(r.ok, false);
  assert.equal(r.statusCode, null);
});

test('runChecksOnce zapíše check pre každý monitor', async () => {
  const db = openDb(':memory:');
  addMonitor(db, 'A', 'https://a.sk');
  addMonitor(db, 'B', 'https://b.sk');
  const fakeFetch = async () => ({ status: 200, ok: true });
  await runChecksOnce(db, fakeFetch);
  const count = db.prepare('SELECT COUNT(*) AS c FROM checks').get().c;
  assert.equal(count, 2);
});
```

- [ ] **Krok 3.2: Over zlyhanie** — `npm test` → FAIL (`src/checker.js` neexistuje).

- [ ] **Krok 3.3: Implementuj** — `src/checker.js`:

```js
import { listMonitors, recordCheck } from './db.js';

export async function checkUrl(url, fetchImpl = fetch) {
  const start = Date.now();
  try {
    const res = await fetchImpl(url, {
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    return { statusCode: res.status, ok: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { statusCode: null, ok: false, latencyMs: Date.now() - start };
  }
}

export async function runChecksOnce(db, fetchImpl = fetch) {
  for (const monitor of listMonitors(db)) {
    const result = await checkUrl(monitor.url, fetchImpl);
    recordCheck(db, monitor.id, result);
  }
}
```

- [ ] **Krok 3.4: Over** — `npm test` → `pass 9`, `fail 0`.

- [ ] **Krok 3.5: Commit**

```
git add src/checker.js test/checker.test.js
git commit -m "Pridaj checker s timeoutom a osetrenim sietovych chyb"
```

---

### Task 4: Express API s Basic Auth (TDD)

**Files:**
- Create: `src/app.js`, `test/api.test.js`

**Interfaces:**
- Consumes: `addMonitor`, `listMonitors`, `deleteMonitor`, `getMonitorStats`
  z `src/db.js`
- Produces: `createApp(db, {adminPassword: string}) → Express app` s routami:
  - `GET /health` → `{status: 'ok'}`
  - `GET /api/monitors` → pole monitorov obohatené o `up/uptime24h/latencies`
  - `POST /api/monitors` (Basic Auth; body `{name, url}`, url musí byť
    http/https) → 201 + `{id, name, url}`; 400 pri neplatnom vstupe; 401 bez hesla
  - `DELETE /api/monitors/:id` (Basic Auth) → 204, alebo 404
  - statické súbory z `public/`

- [ ] **Krok 4.1: Napíš zlyhávajúce testy** — `test/api.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

function startTestServer(t) {
  const db = openDb(':memory:');
  const app = createApp(db, { adminPassword: 'tajne' });
  const server = app.listen(0);
  t.after(() => server.close());
  return { db, base: `http://localhost:${server.address().port}` };
}

const AUTH = 'Basic ' + Buffer.from('admin:tajne').toString('base64');

test('GET /health vráti ok', async (t) => {
  const { base } = startTestServer(t);
  const res = await fetch(`${base}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('POST /api/monitors bez hesla vráti 401', async (t) => {
  const { base } = startTestServer(t);
  const res = await fetch(`${base}/api/monitors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'X', url: 'https://x.sk' }),
  });
  assert.equal(res.status, 401);
});

test('POST s heslom vytvorí monitor a GET ho vráti so štatistikami', async (t) => {
  const { base } = startTestServer(t);
  const res = await fetch(`${base}/api/monitors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: AUTH },
    body: JSON.stringify({ name: 'X', url: 'https://x.sk' }),
  });
  assert.equal(res.status, 201);
  const list = await (await fetch(`${base}/api/monitors`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'X');
  assert.equal(list[0].up, null);
});

test('POST s neplatnou URL vráti 400', async (t) => {
  const { base } = startTestServer(t);
  const res = await fetch(`${base}/api/monitors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: AUTH },
    body: JSON.stringify({ name: 'X', url: 'ftp://zle' }),
  });
  assert.equal(res.status, 400);
});

test('DELETE zmaže monitor', async (t) => {
  const { base } = startTestServer(t);
  const created = await (await fetch(`${base}/api/monitors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: AUTH },
    body: JSON.stringify({ name: 'X', url: 'https://x.sk' }),
  })).json();
  const res = await fetch(`${base}/api/monitors/${created.id}`, {
    method: 'DELETE',
    headers: { authorization: AUTH },
  });
  assert.equal(res.status, 204);
});
```

- [ ] **Krok 4.2: Over zlyhanie** — `npm test` → FAIL (`src/app.js` neexistuje).

- [ ] **Krok 4.3: Implementuj** — `src/app.js`:

```js
import express from 'express';
import { addMonitor, listMonitors, deleteMonitor, getMonitorStats } from './db.js';

function basicAuth(password) {
  return (req, res, next) => {
    const header = req.get('authorization') ?? '';
    const [scheme, encoded] = header.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString();
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      if (pass === password) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    res.status(401).json({ error: 'auth required' });
  };
}

export function createApp(db, { adminPassword }) {
  const app = express();
  app.use(express.json());
  app.use(express.static('public'));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.get('/api/monitors', (req, res) => {
    const monitors = listMonitors(db).map(m => ({
      ...m,
      ...getMonitorStats(db, m.id),
    }));
    res.json(monitors);
  });

  const auth = basicAuth(adminPassword);

  app.post('/api/monitors', auth, (req, res) => {
    const { name, url } = req.body ?? {};
    if (!name || !url || !/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: 'name a platná http(s) url sú povinné' });
    }
    res.status(201).json(addMonitor(db, name, url));
  });

  app.delete('/api/monitors/:id', auth, (req, res) => {
    if (deleteMonitor(db, Number(req.params.id))) {
      res.status(204).end();
    } else {
      res.status(404).json({ error: 'monitor neexistuje' });
    }
  });

  return app;
}
```

- [ ] **Krok 4.4: Over** — `npm test` → `pass 14`, `fail 0`.

- [ ] **Krok 4.5: Commit**

```
git add src/app.js test/api.test.js
git commit -m "Pridaj Express API s Basic Auth ochranou administracie"
```

---

### Task 5: Server — zapojenie všetkého

**Files:**
- Create: `src/server.js`

**Interfaces:**
- Consumes: `openDb`, `pruneOldChecks` (db.js), `runChecksOnce` (checker.js),
  `createApp` (app.js)
- Produces: bežiaci proces `npm start`; env premenné `PORT` (default 3000),
  `DB_PATH` (default `./data/uptime.db`), `ADMIN_PASSWORD` (default `admin123`)

- [ ] **Krok 5.1: Implementuj** — `src/server.js`:

```js
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
```

- [ ] **Krok 5.2: Spusti a ručne over**

Spusti: `npm start`
Očakávané: `Uptime monitor beží na http://localhost:3000`

V druhom termináli pridaj monitor (curl.exe, nie PowerShell alias curl):

```
curl.exe -u admin:admin123 -H "Content-Type: application/json" -d "{\"name\":\"Google\",\"url\":\"https://www.google.com\"}" http://localhost:3000/api/monitors
```

Očakávané: `{"id":1,"name":"Google","url":"https://www.google.com"}`

Počkaj ~1 minútu a over, že pribúdajú checky:

```
curl.exe http://localhost:3000/api/monitors
```

Očakávané: JSON s `"up":true` a neprázdnym `"latencies":[...]`.

- [ ] **Krok 5.3: Commit**

```
git add src/server.js
git commit -m "Zapoj server s checkovacim intervalom a retenciou"
```

---

### Task 6: Status stránka

**Files:**
- Create: `public/index.html`, `public/main.js`, `public/style.css`

**Interfaces:**
- Consumes: `GET /api/monitors` (pole objektov `{id, name, url, up, uptime24h, latencies}`)
- Produces: verejná status stránka na `http://localhost:3000/`

- [ ] **Krok 6.1: Vytvor `public/index.html`**

```html
<!doctype html>
<html lang="sk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Uptime monitor</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Uptime monitor</h1>
  <p class="subtitle">Stav služieb — obnovuje sa každých 30 sekúnd</p>
  <main id="monitors">Načítavam…</main>
  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Krok 6.2: Vytvor `public/main.js`**

```js
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function sparkline(latencies) {
  if (latencies.length < 2) return '';
  const w = 260, h = 40;
  const max = Math.max(...latencies, 1);
  const points = latencies
    .map((ms, i) =>
      `${(i / (latencies.length - 1)) * w},${h - (ms / max) * (h - 4) - 2}`)
    .join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark"><polyline points="${points}" /></svg>`;
}

function render(monitors) {
  const el = document.getElementById('monitors');
  if (monitors.length === 0) {
    el.innerHTML = '<p>Zatiaľ žiadne monitory.</p>';
    return;
  }
  el.innerHTML = monitors.map(m => `
    <article class="card ${m.up === null ? 'unknown' : m.up ? 'up' : 'down'}">
      <header>
        <span class="badge"></span>
        <strong>${esc(m.name)}</strong>
        <span class="uptime">${m.uptime24h === null ? '–' : m.uptime24h + ' %'} / 24 h</span>
      </header>
      <div class="url">${esc(m.url)}</div>
      ${sparkline(m.latencies)}
    </article>
  `).join('');
}

async function refresh() {
  const res = await fetch('/api/monitors');
  render(await res.json());
}

refresh();
setInterval(refresh, 30_000);
```

- [ ] **Krok 6.3: Vytvor `public/style.css`**

```css
:root { font-family: system-ui, sans-serif; color-scheme: light dark; }
body { max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
.subtitle { color: gray; }
.card { border: 1px solid #8884; border-radius: 8px; padding: 1rem; margin: .8rem 0; }
.card header { display: flex; gap: .6rem; align-items: center; }
.badge { width: 12px; height: 12px; border-radius: 50%; background: gray; }
.up .badge { background: #2e9e44; }
.down .badge { background: #d33; }
.uptime { margin-left: auto; color: gray; }
.url { color: gray; font-size: .85rem; margin: .4rem 0; }
.spark { width: 100%; height: 40px; }
.spark polyline { fill: none; stroke: #888; stroke-width: 1.5; }
```

- [ ] **Krok 6.4: Ručne over v prehliadači**

Spusti `npm start` (ak nebeží) a otvor `http://localhost:3000`.
Očakávané: karta „Google" so zeleným kolieskom, uptime % a sparkline grafom.
Pridaj druhý monitor s neexistujúcou URL a over, že do 2 minút zčervenie:

```
curl.exe -u admin:admin123 -H "Content-Type: application/json" -d "{\"name\":\"Pokazeny\",\"url\":\"https://neexistuje-12345.sk\"}" http://localhost:3000/api/monitors
```

- [ ] **Krok 6.5: Commit + push (koniec míľnika 1)**

```
git add public/
git commit -m "Pridaj verejnu status stranku so sparkline grafom"
git push
```

---

## Overenie míľnika (definícia hotovo)

1. `npm test` → 14 testov, `fail 0`
2. `npm start` + `http://localhost:3000` ukazuje monitory so stavom,
   uptime % a grafom; pokazená URL do 2 minút zčervenie
3. Všetko commitnuté a pushnuté na GitHub
