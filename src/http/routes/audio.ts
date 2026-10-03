import { Router } from 'express';
import fs from 'node:fs';
import { audioPath } from '../../adapters/tts/storage';

export const audioRouter = Router();

audioRouter.get('/v1/audio/:id', (req, res) => {
  const { id } = req.params;
  const filePath = audioPath(id);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Audio file not found' } });
  }

  res.setHeader('Content-Type', 'audio/mpeg');
  const stream = fs.createReadStream(filePath);
  return stream.pipe(res);
});
