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
