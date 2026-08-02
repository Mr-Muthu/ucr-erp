import './instrument.js';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

app.listen(env.PORT, () => {
  logger.info(`UCR ERP API listening on http://localhost:${env.PORT} — docs at /api/docs`);
});
