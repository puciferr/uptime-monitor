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
