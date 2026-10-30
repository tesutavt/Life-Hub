import express from 'express';
import path from 'path';
import { upload, removeLocalUpload } from './storage.js';

export function createUploadsRouter() {
  const router = express.Router();

  router.post('/pdf', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'no_file' });
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isPdf = mime.includes('pdf') || ext === '.pdf';
    if (!isPdf) {
      await removeLocalUpload(`/uploads/${file.filename}`);
      return res.status(400).json({ error: 'invalid_type' });
    }
    res.json({
      url: `/uploads/${file.filename}`,
      original_name: file.originalname || file.filename,
      size: file.size
    });
  });

  // Картинки для блоков страниц и фона страницы
  router.post('/image', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'no_file' });
    const mime = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImage = mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif'].includes(ext);
    if (!isImage || file.size > 30 * 1024 * 1024) {
      await removeLocalUpload(`/uploads/${file.filename}`);
      return res.status(400).json({ error: isImage ? 'too_large' : 'invalid_type' });
    }
    res.json({ url: `/uploads/${file.filename}`, original_name: file.originalname || file.filename, size: file.size });
  });

  return router;
}
