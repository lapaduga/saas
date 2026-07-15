import express from 'express';
import { join } from 'path';
import config from './config.js';
import { getDb, migrate, closeDb } from './storage/db.js';
import crmStore from './crm/store.js';
import { indexAll } from './indexer/index.js';
import apiRouter from './routes.js';

const app = express();

app.use(express.json({ limit: config.bodyLimit }));

app.use(express.static(config.publicDir, {
  setHeaders: (res, path) => {
    if (path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.use('/api', apiRouter);

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(join(config.publicDir, 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[SERVER] Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  console.log('[SERVER] Starting AI Support Assistant...');

  const db = getDb();
  migrate();

  crmStore.load();

  await indexAll();

  const server = app.listen(config.port, config.host, () => {
    console.log(`[SERVER] Running on http://${config.host}:${config.port}`);
  });

  const shutdown = () => {
    console.log('[SERVER] Shutting down...');
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch(err => {
  console.error('[SERVER] Fatal:', err);
  process.exit(1);
});
