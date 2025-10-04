import 'dotenv/config';
import { createApp } from './app/createApp.js';
import { openDB } from './utils.js';
import { scheduleFitnessSync } from './routes/fitness/index.js'

await openDB();
scheduleFitnessSync();

const app = createApp();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
