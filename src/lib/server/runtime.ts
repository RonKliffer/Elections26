import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { electionConfig } from '@/config/election';
import { election2022Config } from '@/config/election2022';
import type { ElectionSnapshot } from '../types';
import type { ElectionSourceAdapter } from '../source';
import { Official2026Adapter } from '../source2026';
import { FileSnapshotStore } from './store';
import { ElectionService } from './service';
import { defaultCacheDirectory } from './deployment';
import { Browser2026Adapter } from './browser-source';

function positiveEnv(name: string, fallback: number, minimum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${name} must be an integer >= ${minimum}`);
  return value;
}
const globalService = globalThis as typeof globalThis & { electionService?: ElectionService };
export function getElectionService(): ElectionService {
  if (globalService.electionService) return globalService.electionService;
  const mode = process.env.ELECTION_DATA_MODE ?? 'official';
  if (mode !== 'official' && mode !== 'demo')
    throw new Error('ELECTION_DATA_MODE must be official or demo');
  const config = mode === 'demo' ? election2022Config : electionConfig;
  const transport =
    process.env.ELECTION_SOURCE_TRANSPORT ??
    (process.env.VERCEL === '1' && process.env.ELECTION_CONTAINER !== '1' ? 'fetch' : 'auto');
  if (!['auto', 'fetch', 'browser'].includes(transport))
    throw new Error('ELECTION_SOURCE_TRANSPORT must be auto, fetch or browser');
  const engine = process.env.ELECTION_BROWSER_ENGINE ?? 'webkit';
  if (engine !== 'webkit' && engine !== 'chromium')
    throw new Error('ELECTION_BROWSER_ENGINE must be webkit or chromium');
  const browser =
    transport === 'fetch'
      ? undefined
      : new Browser2026Adapter(
          30000,
          process.env.ELECTION_BROWSER_CHANNEL || undefined,
          () => new Date(),
          engine,
        );
  const adapter: ElectionSourceAdapter =
    mode === 'demo'
      ? {
          async fetchSnapshot() {
            const snapshot = JSON.parse(
              await readFile(path.join(process.cwd(), 'fixtures/2022/official.json'), 'utf8'),
            ) as ElectionSnapshot;
            return {
              ...snapshot,
              mode: 'demo',
              retrievedAt: new Date().toISOString(),
              warnings: [
                ...snapshot.warnings,
                'מצב הדגמה לא מקוון: נתוני 2022 שמורים, ללא שליפה מהמקור הרשמי.',
              ],
            };
          },
        }
      : transport === 'browser'
        ? browser!
        : new Official2026Adapter(
            fetch,
            positiveEnv('ELECTION_REQUEST_TIMEOUT_MS', 20000, 1000),
            () => new Date(),
            browser,
          );
  globalService.electionService = new ElectionService(
    config,
    adapter,
    new FileSnapshotStore(config, process.env.ELECTION_CACHE_DIR ?? defaultCacheDirectory(), mode),
    {
      retryBaseMs: 60000,
      staleMs: positiveEnv('ELECTION_STALE_AFTER_MS', 180000, 10000),
      minIntervalMs: 10000,
      maxBackoffMs: 900000,
    },
  );
  return globalService.electionService;
}
