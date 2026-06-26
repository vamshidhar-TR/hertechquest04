import express from 'express';
import cors from 'cors';
import { MODELS, aiAvailable } from './config.js';
import { describeTransport } from './ai.js';
import { registerRoutes } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

registerRoutes(app);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`[taxlens] Variance Alerts API → http://localhost:${PORT}`);
  if (aiAvailable()) {
    console.log(`[taxlens] AI ENABLED · ${describeTransport()} · explain=${MODELS.explain} · parse=${MODELS.parse}`);
    console.log('[taxlens] NOTE: "ENABLED" only means credentials are present — a bad token/model still');
    console.log('[taxlens]       shows "AI live", but you will see "[ai] ✗ FAILED" on the first call.');
  } else {
    console.log('[taxlens] AI DISABLED — deterministic fallbacks active');
  }
});

export { app };
