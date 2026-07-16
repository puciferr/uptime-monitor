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
