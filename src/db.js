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
