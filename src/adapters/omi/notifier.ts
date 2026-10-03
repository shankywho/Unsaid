import { env } from '../../config/env';
import { fetchRetry } from '../../lib/http';
import { logger } from '../../lib/logger';

export interface OmiNotifier {
  notify(omiUid: string, message: string): Promise<void>;
}

/** Assumed endpoint (see DECISIONS.md). No-op unless OMI_APP_ID + OMI_APP_SECRET are set. */
export class HttpOmiNotifier implements OmiNotifier {
  async notify(omiUid: string, message: string): Promise<void> {
    if (!env.OMI_APP_ID || !env.OMI_APP_SECRET) return;
    try {
      const url = `https://api.omi.me/v2/integrations/${encodeURIComponent(env.OMI_APP_ID)}/notification?uid=${encodeURIComponent(omiUid)}&message=${encodeURIComponent(message)}`;
      const res = await fetchRetry(url, {
        method: 'POST',
        timeoutMs: 10_000,
        headers: { authorization: `Bearer ${env.OMI_APP_SECRET}` },
      });
      if (!res.ok) logger.warn({ status: res.status }, 'omi notification failed');
    } catch (err) {
      logger.warn({ err }, 'omi notification error');
    }
  }
}

export class MockOmiNotifier implements OmiNotifier {
  readonly sent: { omiUid: string; message: string }[] = [];
  async notify(omiUid: string, message: string): Promise<void> {
    this.sent.push({ omiUid, message });
  }
}
