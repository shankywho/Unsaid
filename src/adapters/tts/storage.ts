import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { newId } from '../../lib/ids';

export const audioPath = (id: string): string => path.resolve(env.AUDIO_DIR, `${id}.mp3`);

export async function saveAudio(bytes: Buffer): Promise<string> {
  await fs.mkdir(path.resolve(env.AUDIO_DIR), { recursive: true });
  const id = newId();
  await fs.writeFile(audioPath(id), bytes);
  return id;
}
