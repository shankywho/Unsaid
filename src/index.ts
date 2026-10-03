import { env } from './config/env';
import { createApp } from './http/app';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  const app = createApp();
  app.listen(env.PORT, () => logger.info({ port: env.PORT, mock: env.MOCK_EXTERNALS }, 'unsaid listening'));
}

main().catch((err) => {
  logger.error({ err }, 'boot failed');
  process.exit(1);
});
