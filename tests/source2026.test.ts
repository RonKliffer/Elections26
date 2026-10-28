import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { electionConfig } from '../src/config/election';
import { Official2026Adapter, normalizeOfficial2026 } from '../src/lib/source2026';
import { ElectionService } from '../src/lib/server/service';
import { calculateElection } from '../src/lib/engine';

const html = await readFile('fixtures/2026/source.html', 'utf8');
const retrievedAt = '2026-10-27T22:30:00.000Z';
const normalize = (body = html) => normalizeOfficial2026(body, electionConfig, retrievedAt);
function edit(change: (dom: ReturnType<typeof load>) => void): string {
  const $ = load(html);
  change($);
  return $.html();
}

describe('2026 official results', () => {
  it('reads the real redesigned page once, without double-counting mobile cards', () => {
    const snapshot = normalize();
    expect(snapshot).toMatchObject({
      electionId: '26',
      mode: 'official',
      status: 'provisional',
      validVotes: 2661,
      invalidVotes: 9,
      votesCast: 2670,
      eligibleVoters: 7331981,
      officialUpdatedAt: '2026-10-27T22:19:00.000Z',
      retrievedAt,
      reportingProgress: null,
      warnings: [],
    });
    expect(snapshot.parties).toHaveLength(38);
    expect(snapshot.parties.reduce((sum, p) => sum + p.votes, 0)).toBe(2661);
    expect(snapshot.parties.find((p) => p.id === 'דרך')).toMatchObject({
      votes: 442,
      officialSeats: null,
    });
    expect(snapshot.parties.find((p) => p.id === 'פה')!.name).toContain('אני ואתה');
    expect(snapshot.parties.find((p) => p.id === 'ד')!.name).toBe('השותפות לכולם');
    expect(snapshot.parties.every((p) => p.officialSeats === null)).toBe(true);
  });
  it('uses all five 2026 agreements and keeps withdrawn zero-vote lists optional', () => {
    expect(electionConfig.testing).toBe(false);
    expect(electionConfig.surplusAgreements).toEqual([
      ['מחל', 'ט'],
      ['שס', 'ג'],
      ['דרך', 'אמת'],
      ['רק', 'ל'],
      ['עם', 'ודם'],
    ]);
    const snapshot = normalize(
      edit(($) => {
        $('table tbody tr')
          .filter((_, row) => ['כן', 'צבי'].includes($(row).children('td').eq(1).text().trim()))
          .remove();
      }),
    );
    expect(snapshot.parties).toHaveLength(36);
  });
  it('does not mistake the future final-results notice for final results', () => {
    expect(normalize().status).toBe('provisional');
    expect(
      normalize(
        edit(($) => {
          $('.fs-h3-title').last().prepend('תוצאות סופיות רשמיות ');
        }),
      ).status,
    ).toBe('final');
    expect(
      normalize(
        edit(($) => {
          $('#ruleMsg, #ruleMsgMobile').remove();
        }),
      ).status,
    ).toBe('unknown');
  });
  it('converts summer and winter publication times using Israel timezone rules', () => {
    expect(
      normalize(html.replaceAll('28/10/2026 00:19', '28/07/2026 00:19')).officialUpdatedAt,
    ).toBe('2026-07-27T21:19:00.000Z');
    expect(
      normalize(html.replaceAll('28/10/2026 00:19', '28/12/2026 00:19')).officialUpdatedAt,
    ).toBe('2026-12-27T22:19:00.000Z');
    expect(normalize(html.replaceAll('28/10/2026 00:19', '')).officialUpdatedAt).toBeNull();
    expect(() => normalize(html.replaceAll('28/10/2026 00:19', '31/02/2026 00:19'))).toThrow(/זמן/);
  });
  it.each([
    'summary',
    'table',
    'header',
    'party',
    'duplicate',
    'votes',
    'cast',
    'negative',
    'election',
  ])('rejects a broken %s rather than publishing a partial or inconsistent source', (kind) => {
    const changed = edit(($) => {
      const table = $('table');
      const row = table.find('tbody tr').first();
      if (kind === 'summary') $('[id$="_TotalTags"]').remove();
      if (kind === 'table') table.remove();
      if (kind === 'header') table.find('th').first().text('changed');
      if (kind === 'party') row.remove();
      if (kind === 'duplicate') table.find('tbody').append(row.clone());
      if (kind === 'votes') row.children('td').eq(3).text('720');
      if (kind === 'cast')
        $('[id$="_TotalTags"] .info-box').eq(1).find('.fw-bold.fs-2').text('2,671');
      if (kind === 'negative') row.children('td').eq(3).text('-719');
      if (kind === 'election') $('h1').text('תוצאות הבחירות לכנסת ה-25');
    });
    expect(() => normalize(changed)).toThrow();
  });
  it('includes new parties, warns, and preserves the national reconciliation', () => {
    const changed = edit(($) => {
      const row = $('table tbody tr').last().clone();
      row.children('td').eq(0).text('רשימה חדשה');
      row.children('td').eq(1).text('חדש');
      $('table tbody').append(row);
    });
    expect(normalize(changed).parties).toHaveLength(39);
    expect(normalize(changed).warnings[0]).toContain('חדש');
  });
  it('fetches one complete national publication with no dependency on the CSV host', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(html));
    const snapshot = await new Official2026Adapter(
      request,
      1000,
      () => new Date(retrievedAt),
    ).fetchSnapshot(electionConfig);
    expect(snapshot).toEqual(normalize());
    expect(request).toHaveBeenCalledExactlyOnceWith(
      electionConfig.sourceUrl,
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });
  it.each(['404', 'challenge', 'maintenance', 'timeout'])(
    'rejects %s and never loads historical data',
    async (kind) => {
      const request = vi.fn<typeof fetch>();
      if (kind === 'timeout')
        request.mockRejectedValue(new DOMException('Timed out', 'TimeoutError'));
      else
        request.mockResolvedValue(
          new Response('<html>maintenance</html>', {
            status: kind === '404' ? 404 : kind === 'challenge' ? 202 : 200,
            headers: kind === 'challenge' ? { 'x-amzn-waf-action': 'challenge' } : {},
          }),
        );
      await expect(
        new Official2026Adapter(request, 1000).fetchSnapshot(electionConfig),
      ).rejects.toThrow();
      expect(request).toHaveBeenCalledOnce();
    },
  );
  it('keeps valid early votes visible even if integer-quota allocation is unresolved', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(html));
    const service = new ElectionService(
      electionConfig,
      new Official2026Adapter(request, 1000, () => new Date(retrievedAt)),
      { load: async () => null, save: vi.fn(async () => {}) },
      {
        now: () => Date.parse(retrievedAt),
        minIntervalMs: 0,
        retryBaseMs: 0,
        staleMs: 10000,
        maxBackoffMs: 0,
      },
    );
    await service.refresh();
    expect(service.getState()).toMatchObject({
      connection: 'fresh',
      error: null,
      snapshot: { validVotes: 2661 },
    });
    expect(service.getState().calculation!.status).toBe('unresolved');
    expect(service.getState().calculation!.diagnostics.length).toBeGreaterThan(0);
    // The same verified roster and agreements support complete election-sized counts.
    const scaled = normalize();
    scaled.parties = scaled.parties.map((p) => ({ ...p, votes: p.votes * 1000 }));
    scaled.validVotes *= 1000;
    expect(calculateElection(scaled, electionConfig)).toMatchObject({
      status: 'ok',
      totalSeats: 120,
    });
    request.mockResolvedValue(new Response('Unavailable', { status: 404 }));
    await service.refresh();
    expect(service.getState()).toMatchObject({
      connection: 'stale',
      snapshot: { validVotes: 2661 },
    });
  });
});
