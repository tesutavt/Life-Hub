import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..');

export const UPLOADS_DIR = path.join(SERVER_ROOT, 'uploads');
export const CLIENT_DIST_DIR = path.resolve(SERVER_ROOT, '../client/dist');
export const CLIENT_INDEX_FILE = path.join(CLIENT_DIST_DIR, 'index.html');
