import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { UPLOADS_DIR } from '../../config/paths.js';

const storage = multer.diskStorage({
  async destination(_req, _file, cb) {
    try {
      await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (error) {
      cb(error, UPLOADS_DIR);
    }
  },
  filename(_req, file, cb) {
    const ext = path.extname(file?.originalname || '').slice(0, 16);
    const random = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${random}${ext}`);
  }
});

export const MAX_PDF_FILE_SIZE = 512 * 1024 * 1024;
export const upload = multer({ storage, limits: { fileSize: MAX_PDF_FILE_SIZE } });

export async function removeLocalUpload(url) {
  if (!url || typeof url !== 'string') return;
  if (!url.startsWith('/uploads/')) return;
  const filename = path.basename(url);
  const filePath = path.join(UPLOADS_DIR, filename);
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore missing files
  }
}
