import type { DashboardState, ElectionConfig, ElectionSnapshot } from '../types';
import { additionalVotesForNextSeat, calculateElection, compareSnapshots } from '../engine';
import { assertSnapshot, type ElectionSourceAdapter } from '../source';
import { snapshotFingerprint, type SnapshotStore } from './store';

export interface ServiceOptions {
  retryBaseMs: number;
  staleMs: number;
  minIntervalMs: number;
  maxBackoffMs: number;
  now?: () => number;
}
export class ElectionService {
  private state: DashboardState;
  private previous: ElectionSnapshot | null = null;
  private inFlight: Promise<void> | null = null;
  private initialization: Promise<void> | null = null;
  private failures = 0;
  private lastAttempt = -Infinity;
  private now: () => number;
  constructor(
    private config: ElectionConfig,
    private adapter: ElectionSourceAdapter,
    private store: SnapshotStore,
    private options: ServiceOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.state = {
      config,
      connection: 'loading',
      error: null,
      refreshing: false,
      lastAttemptAt: null,
      nextAllowedRefreshAt: null,
      snapshot: null,
      calculation: null,
      comparison: null,
      nextSeats: {},
      changes: null,
      previousSeats: null,
    };
  }
  private derive(snapshot: ElectionSnapshot): void {
    const calculation = calculateElection(snapshot, this.config);
    this.state.calculation = calculation;
    this.state.comparison = calculateElection(snapshot, this.config, 'unrounded');
    this.state.nextSeats = Object.fromEntries(
      calculation.parties.map((p) => [
        p.id,
        additionalVotesForNextSeat(snapshot, this.config, p.id, calculation),
      ]),
    );
    this.state.changes = this.previous
      ? compareSnapshots(this.previous, snapshot, this.config)
      : null;
    const before = this.previous ? calculateElection(this.previous, this.config) : null;
    this.state.previousSeats =
      before?.status === 'ok'
        ? Object.fromEntries(before.parties.map((p) => [p.id, p.finalSeats]))
        : null;
  }
  initialize(): Promise<void> {
    this.initialization ??= (async () => {
      try {
        const saved = await this.store.load();
        if (saved) {
          assertSnapshot(saved.current, this.config);
          if (saved.previous) assertSnapshot(saved.previous, this.config);
          this.previous = saved.previous;
          this.state.snapshot = saved.current;
          this.derive(saved.current);
          this.state.connection = 'stale';
        }
      } catch (e) {
        this.state.error = e instanceof Error ? e.message : 'שגיאת מטמון';
      }
    })();
    return this.initialization;
  }
  getState(): DashboardState {
    if (
      this.state.connection === 'fresh' &&
      this.state.snapshot &&
      this.now() - Date.parse(this.state.snapshot.retrievedAt) > this.options.staleMs
    )
      return { ...this.state, connection: 'stale' };
    return this.state;
  }
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    const wait = this.failures
      ? Math.min(this.options.maxBackoffMs, this.options.retryBaseMs * 2 ** this.failures)
      : this.options.minIntervalMs;
    if (this.now() - this.lastAttempt < Math.max(wait, this.options.minIntervalMs))
      return Promise.resolve();
    this.inFlight = this.performRefresh().finally(() => {
      this.inFlight = null;
      this.state.refreshing = false;
      this.updateCooldown();
    });
    return this.inFlight;
  }
  private async performRefresh(): Promise<void> {
    await this.initialize();
    this.state.refreshing = true;
    this.lastAttempt = this.now();
    this.state.lastAttemptAt = new Date(this.lastAttempt).toISOString();
    try {
      const next = await this.adapter.fetchSnapshot(this.config);
      assertSnapshot(next, this.config);
      const changed =
        !this.state.snapshot ||
        snapshotFingerprint(next) !== snapshotFingerprint(this.state.snapshot);
      if (changed) {
        this.previous = this.state.snapshot;
        this.derive(next);
      }
      this.state.snapshot = next;
      this.failures = 0;
      this.state.connection = 'fresh';
      this.state.error = null;
      try {
        await this.store.save({ current: next, previous: this.previous });
      } catch {
        this.state.error =
          'הנתונים נשלפו, אך שמירת המטמון נכשלה. אין הגנה מפני אובדן הנתונים באתחול.';
      }
    } catch (e) {
      this.failures++;
      this.state.connection = this.state.snapshot ? 'stale' : 'error';
      this.state.error = e instanceof Error ? e.message : 'שגיאה בחיבור למקור הרשמי.';
    }
  }
  private updateCooldown(): void {
    const delay = this.failures
      ? Math.min(
          this.options.maxBackoffMs,
          this.options.retryBaseMs * 2 ** Math.min(this.failures, 10),
        )
      : this.options.minIntervalMs;
    // This is permission to retry, never a scheduled background request.
    this.state.nextAllowedRefreshAt = new Date(
      this.lastAttempt + Math.max(delay, this.options.minIntervalMs),
    ).toISOString();
  }
}
