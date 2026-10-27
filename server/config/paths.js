import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');

// LIFEHUB_DATA_DIR / LIFEHUB_CLIENT_DIST задаёт Electron-оболочка: в собранном приложении
// папка с кодом доступна только на чтение, поэтому данные лежат в профиле пользователя.
export const UPLOADS_DIR = process.env.LIFEHUB_DATA_DIR
  ? path.join(process.env.LIFEHUB_DATA_DIR, 'uploads')
  : path.join(SERVER_ROOT, 'uploads');
export const CLIENT_DIST_DIR = process.env.LIFEHUB_CLIENT_DIST || path.resolve(SERVER_ROOT, '../client/dist');
export const CLIENT_INDEX_FILE = path.join(CLIENT_DIST_DIR, 'index.html');

// Кэш озвучки (mp3), см. routes/tts
export const TTS_CACHE_DIR = process.env.LIFEHUB_DATA_DIR
  ? path.join(process.env.LIFEHUB_DATA_DIR, 'tts-cache')
  : path.join(SERVER_ROOT, 'tts-cache');
