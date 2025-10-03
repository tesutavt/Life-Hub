import express from 'express';
import { CLIENT_DIST_DIR, CLIENT_INDEX_FILE } from '../config/paths.js';

export function registerClientAssets(app) {
  app.use(express.static(CLIENT_DIST_DIR));

  app.get('*', (req, res) => {
    res.sendFile(CLIENT_INDEX_FILE, (error) => {
      if (!error) return;

      if (error.code === 'ENOENT') {
        res.status(200).send('API running');
        return;
      }

      res.status(500).send('Unable to load client');
    });
  });
}
