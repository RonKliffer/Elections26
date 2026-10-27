import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionService } from '../src/lib/server/service';

const browser = vi.hoisted(() => ({ fetchSnapshot: vi.fn() }));
vi.mock('../src/lib/server/browser-source', () => ({
  Browser2026Adapter: class {
    fetchSnapshot = browser.fetchSnapshot;
  },
}));
const globals = globalThis as typeof globalThis & { electionService?: ElectionService };
let cacheDir: string;
beforeEach(async () => {
  vi.resetModules();
  browser.fetchSnapshot.mockReset();
  delete globals.electionService;
  cacheDir = await mkdtemp(path.join(os.tmpdir(), 'election-runtime-'));
  vi.stubEnv('ELECTION_CACHE_DIR', cacheDir);
  vi.stubEnv('ELECTION_SOURCE_URL', 'https://votes26.bechirot.gov.il');
  vi.stubEnv('ELECTION_SOURCE_TRANSPORT', undefined);
  vi.stubEnv('ELECTION_CONTAINER', undefined);
  vi.stubEnv('VERCEL', undefined);
});
afterEach(async () => {
  delete globals.electionService;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(cacheDir, { recursive: true, force: true });
});
describe('election runtime selection', () => {
  it.each([false, true])(
    'provisions browser fallback only for Vercel containers (%s)',
    async (container) => {
      vi.stubEnv('ELECTION_DATA_MODE', 'official');
      vi.stubEnv('VERCEL', '1');
      if (container) vi.stubEnv('ELECTION_CONTAINER', '1');
      const snapshot = JSON.parse(await readFile('fixtures/2026/official.json', 'utf8'));
      browser.fetchSnapshot.mockResolvedValue({
        ...snapshot,
        retrievedAt: new Date().toISOString(),
      });
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 })),
      );
      const { getElectionService } = await import('../src/lib/server/runtime');
      const service = getElectionService();
      await service.refresh();
      expect(browser.fetchSnapshot).toHaveBeenCalledTimes(container ? 1 : 0);
      expect(service.getState().connection).toBe(container ? 'fresh' : 'error');
    },
  );
  it('defaults to the live 2026 adapter and saves a 2026 snapshot', async () => {
    vi.stubEnv('ELECTION_DATA_MODE', 'official');
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(await readFile('fixtures/2026/source.html', 'utf8')));
    vi.stubGlobal('fetch', request);
    const { getElectionService } = await import('../src/lib/server/runtime');
    const service = getElectionService();
    await service.refresh();
    expect(service.getState()).toMatchObject({
      config: { electionId: '26', testing: false },
      connection: 'fresh',
      snapshot: { electionId: '26', mode: 'official', validVotes: 2661 },
    });
    expect(request).toHaveBeenCalledOnce();
    expect(getElectionService()).toBe(service);
  });
  it('keeps the explicit offline demo on its own 2022 config with no network calls', async () => {
    vi.stubEnv('ELECTION_DATA_MODE', 'demo');
    const request = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', request);
    const { getElectionService } = await import('../src/lib/server/runtime');
    const service = getElectionService();
    await service.refresh();
    expect(service.getState()).toMatchObject({
      config: { electionId: '25', testing: true },
      connection: 'fresh',
      snapshot: { electionId: '25', mode: 'demo', validVotes: 4764742 },
      calculation: { status: 'ok', totalSeats: 120 },
    });
    expect(request).not.toHaveBeenCalled();
  });
});
