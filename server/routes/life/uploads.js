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

  return router;
}
