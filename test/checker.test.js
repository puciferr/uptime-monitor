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
