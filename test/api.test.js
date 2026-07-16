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
