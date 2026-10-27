import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { electionConfig } from '@/config/election';
import type { ElectionSnapshot } from '../types';
import { Official2022Adapter, type ElectionSourceAdapter } from '../source';
import { FileSnapshotStore } from './store';
import { ElectionService } from './service';
import { defaultCacheDirectory } from './deployment';

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
      : new Official2022Adapter(
          fetch,
          positiveEnv('ELECTION_REQUEST_TIMEOUT_MS', 20000, 1000),
          () => new Date(),
          async () => {
            const [html, provenance] = await Promise.all([
              readFile(path.join(process.cwd(), 'fixtures/2022/source.html'), 'utf8'),
              readFile(path.join(process.cwd(), 'fixtures/2022/provenance.json'), 'utf8'),
            ]);
            return { html, capturedAt: JSON.parse(provenance).capturedAt as string };
          },
        );
  globalService.electionService = new ElectionService(
    electionConfig,
    adapter,
    new FileSnapshotStore(
      electionConfig,
      process.env.ELECTION_CACHE_DIR ?? defaultCacheDirectory(),
      mode,
    ),
    {
      retryBaseMs: 60000,
      staleMs: positiveEnv('ELECTION_STALE_AFTER_MS', 180000, 10000),
      minIntervalMs: 10000,
      maxBackoffMs: 900000,
    },
  );
  return globalService.electionService;
}
