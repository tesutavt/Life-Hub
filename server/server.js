import 'dotenv/config';
import { createApp } from './app/createApp.js';
import { openDB } from './utils.js';
import { scheduleFitnessSync } from './routes/fitness/index.js'
import { scheduleCleanup } from './jobs/cleanup.js';

await openDB();
scheduleFitnessSync();
scheduleCleanup();

const app = createApp();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
