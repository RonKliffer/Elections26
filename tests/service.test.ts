import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ElectionService } from '../src/lib/server/service';
import {
  FileSnapshotStore,
  type SnapshotStore,
  type StoredSnapshots,
} from '../src/lib/server/store';
import type { ElectionSourceAdapter } from '../src/lib/source';
import type { ElectionSnapshot } from '../src/lib/types';
import { addVotes, config, final2022 } from './helpers';

const options = { pollMs: 60000, staleMs: 180000, manualMinMs: 10000, maxBackoffMs: 900000 };
function memoryStore(initial: StoredSnapshots | null = null): SnapshotStore {
  let saved = initial;
  return {
    load: vi.fn(async () => saved),
    save: vi.fn(async (value: StoredSnapshots) => {
      saved = structuredClone(value);
    }),
  };
}
const services: ElectionService[] = [];
function service(adapter: ElectionSourceAdapter, store = memoryStore()) {
  const s = new ElectionService(config, adapter, store, options);
  services.push(s);
  return s;
}
afterEach(() => {
  services.forEach((s) => s.stop());
  services.length = 0;
  vi.useRealTimers();
});

describe('shared election polling service', () => {
  it('fetches once for overlapping callers', async () => {
    let resolve!: (s: ElectionSnapshot) => void;
    const fetchSnapshot = vi.fn(
      () =>
        new Promise<ElectionSnapshot>((r) => {
          resolve = r;
        }),
    );
    const s = service({ fetchSnapshot });
    await s.initialize();
    const a = s.refresh(),
      b = s.refresh(true);
    await Promise.resolve();
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    resolve({ ...final2022, retrievedAt: new Date().toISOString() });
    await Promise.all([a, b]);
    expect(s.getState().connection).toBe('fresh');
    expect(s.getState().calculation?.totalSeats).toBe(120);
  });
  it('retains good data and marks it stale on a temporary outage', async () => {
    vi.useFakeTimers();
    const fetchSnapshot = vi
      .fn()
      .mockResolvedValueOnce(final2022)
      .mockRejectedValueOnce(new Error('network unavailable'));
    const s = service({ fetchSnapshot });
    await s.refresh();
    await vi.advanceTimersByTimeAsync(10000);
    await s.refresh(true);
    expect(s.getState().snapshot?.validVotes).toBe(4764742);
    expect(s.getState().connection).toBe('stale');
    expect(s.getState().error).toContain('network unavailable');
  });
  it('never fabricates a first snapshot when offline', async () => {
    const s = service({ fetchSnapshot: vi.fn().mockRejectedValue(new Error('offline')) });
    await s.refresh();
    expect(s.getState()).toMatchObject({ snapshot: null, calculation: null, connection: 'error' });
  });
  it('rejects a malformed refresh without replacing the previous snapshot', async () => {
    vi.useFakeTimers();
    const s = service({
      fetchSnapshot: vi
        .fn()
        .mockResolvedValueOnce(final2022)
        .mockResolvedValueOnce({ ...final2022, validVotes: 1 }),
    });
    await s.refresh();
    await vi.advanceTimersByTimeAsync(10000);
    await s.refresh(true);
    expect(s.getState().snapshot?.validVotes).toBe(4764742);
    expect(s.getState().connection).toBe('stale');
  });
  it('enforces the manual cooldown and failure backoff', async () => {
    vi.useFakeTimers();
    const fetchSnapshot = vi.fn().mockRejectedValue(new Error('offline'));
    const s = service({ fetchSnapshot });
    await s.refresh();
    await s.refresh(true);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(119999);
    await s.refresh(true);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await s.refresh(true);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });
  it('polls in the background and stops cleanly', async () => {
    vi.useFakeTimers();
    const fetchSnapshot = vi
      .fn()
      .mockImplementation(async () => ({ ...final2022, retrievedAt: new Date().toISOString() }));
    const s = service({ fetchSnapshot });
    await s.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
    s.stop();
    await vi.advanceTimersByTimeAsync(120000);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });
  it('preserves meaningful deltas across unchanged successful refreshes', async () => {
    vi.useFakeTimers();
    const updated = { ...addVotes(final2022, 'מחל', 1000), retrievedAt: new Date().toISOString() };
    const fetchSnapshot = vi.fn().mockResolvedValueOnce(final2022).mockResolvedValue(updated);
    const s = service({ fetchSnapshot });
    await s.refresh();
    await vi.advanceTimersByTimeAsync(10000);
    await s.refresh(true);
    expect(s.getState().changes?.parties['מחל']?.votes).toBe(1000);
    await vi.advanceTimersByTimeAsync(10000);
    await s.refresh(true);
    expect(s.getState().changes?.parties['מחל']?.votes).toBe(1000);
  });
  it('restores validated last-known results on restart before an offline refresh', async () => {
    const s = service(
      { fetchSnapshot: vi.fn().mockRejectedValue(new Error('offline')) },
      memoryStore({ current: final2022, previous: null }),
    );
    await s.initialize();
    expect(s.getState().connection).toBe('stale');
    expect(s.getState().calculation?.totalSeats).toBe(120);
    await s.refresh();
    expect(s.getState().snapshot?.validVotes).toBe(4764742);
  });
  it('surfaces a persistence failure while retaining fresh valid data', async () => {
    const s = service(
      {
        fetchSnapshot: vi
          .fn()
          .mockResolvedValue({ ...final2022, retrievedAt: new Date().toISOString() }),
      },
      {
        load: async () => null,
        save: async () => {
          throw new Error('disk full');
        },
      },
    );
    await s.refresh();
    expect(s.getState().connection).toBe('fresh');
    expect(s.getState().error).toContain('שמירת המטמון נכשלה');
  });
});

describe('durable file store', () => {
  it('saves atomically, restores both snapshots, and isolates elections and modes', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'election-test-'));
    try {
      const store = new FileSnapshotStore(config, dir, 'official');
      expect(await store.load()).toBeNull();
      const data = { current: final2022, previous: addVotes(final2022, 'מחל', -10) };
      await store.save(data);
      expect(await store.load()).toEqual(data);
      expect(await new FileSnapshotStore(config, dir, 'demo').load()).toBeNull();
      expect(
        await new FileSnapshotStore({ ...config, electionId: '26' }, dir, 'official').load(),
      ).toBeNull();
      await writeFile(store.file, 'broken');
      await expect(store.load()).rejects.toThrow(/מטמון/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
