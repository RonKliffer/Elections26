import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import {
  assertSnapshot,
  normalizeOfficial,
  Official2022Adapter,
  parseNationalHtml,
} from '../src/lib/source';
import { config, final2022 } from './helpers';
const html = await readFile('fixtures/2022/source.html', 'utf8');
const csv = await readFile('fixtures/2022/cities.csv', 'utf8');
const retrievedAt = '2026-10-23T12:00:00.000Z';
describe('official source ingestion', () => {
  it('reconciles all official HTML/CSV counts, including external envelopes', () => {
    const s = normalizeOfficial(html, csv, config, retrievedAt);
    expect(s).toMatchObject({
      validVotes: 4764742,
      invalidVotes: 29851,
      votesCast: 4794593,
      eligibleVoters: 6788804,
      status: 'final',
      officialUpdatedAt: null,
      reportingProgress: null,
    });
    expect(s.parties).toHaveLength(40);
    expect(s.parties).toEqual(final2022.parties);
    expect(s.warnings).toEqual([]);
  });
  it('finds the real linked city export without executing JavaScript', () => {
    expect(parseNationalHtml(html, config).csvUrl).toBe(
      'https://media25.bechirot.gov.il/files/expc.csv?',
    );
  });
  it.each([
    '',
    '<html>maintenance</html>',
    html.replaceAll('ResultsSummaryTable', 'UnknownTable'),
    html.replaceAll('TableData', 'ChangedTable'),
  ])('rejects unavailable or changed markup', (body) => {
    expect(() => normalizeOfficial(body, csv, config, retrievedAt)).toThrow();
  });
  it('rejects missing expected parties even when the source otherwise reconciles', () => {
    expect(() =>
      normalizeOfficial(
        html,
        csv,
        { ...config, expectedBallots: [...config.expectedBallots, 'NEW'] },
        retrievedAt,
      ),
    ).toThrow(/חסרות/);
  });
  it('includes unexpected parties and warns rather than discarding votes', () => {
    const s = normalizeOfficial(
      html,
      csv,
      { ...config, expectedBallots: config.expectedBallots.filter((b) => b !== 'מרצ') },
      retrievedAt,
    );
    expect(s.parties).toHaveLength(40);
    expect(s.warnings[0]).toContain('מרצ');
  });
  it('rejects malformed CSV, changed headers, duplicate rows, or national discrepancies', () => {
    expect(() => normalizeOfficial(html, 'bad,csv\n1,2', config, retrievedAt)).toThrow();
    expect(() =>
      normalizeOfficial(html, csv.replace('כשרים', 'unknown'), config, retrievedAt),
    ).toThrow();
    const lines = csv.trimEnd().split(/\r?\n/);
    expect(() =>
      normalizeOfficial(html, [...lines, lines[1]!].join('\r\n'), config, retrievedAt),
    ).toThrow(/כפול/);
    expect(() =>
      normalizeOfficial(html.replace('4,764,742', '4,764,743'), csv, config, retrievedAt),
    ).toThrow(/אי־התאמה/);
  });
  it('rejects omitted external-envelope rows', () => {
    const without = csv
      .split(/\r?\n/)
      .filter((line) => !line.includes('מעטפות חיצוניות'))
      .join('\n');
    expect(() => normalizeOfficial(html, without, config, retrievedAt)).toThrow();
  });
  it('validates summary consistency and wrong election identity', () => {
    expect(() => assertSnapshot({ ...final2022, votesCast: 4764742 }, config)).toThrow();
    expect(() =>
      normalizeOfficial(html, csv, { ...config, electionId: '26' }, retrievedAt),
    ).toThrow(/מזהה הבחירות/);
  });
  it('allows unavailable optional HTML fields without inventing values', () => {
    const parsed = parseNationalHtml(
      html.replace('סה&quot;כ בעלי זכות בחירה', 'Unknown optional field'),
      config,
    );
    expect(parsed.eligibleVoters).toBeNull();
  });
  it('uses server-side verified endpoints and fresh retrieval time', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html))
      .mockResolvedValueOnce(new Response(csv));
    const s = await new Official2022Adapter(
      request,
      1000,
      () => new Date(retrievedAt),
    ).fetchSnapshot(config);
    expect(s.retrievedAt).toBe(retrievedAt);
    expect(request).toHaveBeenCalledTimes(2);
    expect(String(request.mock.calls[1]![0])).toContain('media25.bechirot.gov.il/files/expc.csv');
  });
  it('rejects HTTP errors rather than substituting a demo fixture', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(new Official2022Adapter(request).fetchSnapshot(config)).rejects.toThrow(
      'HTTP 503',
    );
  });
  it('rejects a nonofficial export host', () => {
    expect(() =>
      parseNationalHtml(
        html.replaceAll('media25.bechirot.gov.il', 'untrusted.example.com'),
        config,
      ),
    ).toThrow(/מאושר/);
  });
});
