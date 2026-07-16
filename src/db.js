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
