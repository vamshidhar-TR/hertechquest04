import express from 'express';
import cors from 'cors';
import { MODELS, claudeAvailable } from './config.js';
import { describeTransport } from './claude.js';
import { registerRoutes } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

registerRoutes(app);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`[cocounsel] Variance Alerts API → http://localhost:${PORT}`);
  if (claudeAvailable()) {
    console.log(`[cocounsel] Claude ENABLED · ${describeTransport()} · explain=${MODELS.explain} · parse=${MODELS.parse}`);
    console.log('[cocounsel] NOTE: "ENABLED" only means credentials are present — a bad token/model still');
    console.log('[cocounsel]       shows "Claude live", but you will see "[claude] ✗ FAILED" on the first call.');
  } else {
    console.log('[cocounsel] Claude DISABLED — deterministic fallbacks active');
  }
});

export { app };
