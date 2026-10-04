import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { audioPath } from '../../adapters/tts/storage';
import { notFound } from '../../lib/errors';

export const audioRouter = Router();

const AudioParams = z.object({ id: z.uuid() }); // also blocks path traversal

/** Public by design (browser <audio> cannot send headers); ids are unguessable UUIDs. */
audioRouter.get('/v1/audio/:id', (req, res, next) => {
  const parsed = AudioParams.safeParse(req.params);
  if (!parsed.success) return next(notFound('Audio file'));
  const filePath = audioPath(parsed.data.id);
  if (!fs.existsSync(filePath)) return next(notFound('Audio file'));

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return fs.createReadStream(filePath).pipe(res);
});
