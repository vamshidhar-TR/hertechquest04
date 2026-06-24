import express from 'express';
import cors from 'cors';
import { claudeAvailable } from './config.js';
import { registerRoutes } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

registerRoutes(app);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`[cocounsel] Variance Alerts API → http://localhost:${PORT}`);
  console.log(`[cocounsel] Claude ${claudeAvailable() ? 'ENABLED' : 'DISABLED — offline fallbacks active'}`);
});

export { app };
