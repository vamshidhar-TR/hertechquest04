import express from 'express';
import cors from 'cors';
import { aiAvailable } from './config.js';
import { registerRoutes } from './routes.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

registerRoutes(app);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`TaxLens API on http://localhost:${PORT} · AI ${aiAvailable() ? 'enabled' : 'disabled (offline fallbacks)'}`);
});

export { app };
