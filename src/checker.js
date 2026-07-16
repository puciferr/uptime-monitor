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
