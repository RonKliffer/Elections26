import { load } from 'cheerio';
import { parse } from 'csv-parse/sync';
import { validateElectionInput } from './engine';
import type { ElectionConfig, ElectionSnapshot, PartyVotes } from './types';

const clean = (s: string): string =>
  s
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const count = (s: string, label: string): number => {
  const value = clean(s).replaceAll(',', '');
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new Error(`נתון לא תקין (${label}): ${s.slice(0, 60)}`);
  return Number(value);
};

export interface ParsedNational {
  parties: PartyVotes[];
  validVotes: number;
  invalidVotes: number | null;
  votesCast: number | null;
  eligibleVoters: number | null;
  status: ElectionSnapshot['status'];
  csvUrl: string;
}

export function parseNationalHtml(html: string, config: ElectionConfig): ParsedNational {
  const $ = load(html);
  const heading = clean($('h1').text());
  if (!new RegExp(`(?:ה[־\\- ]*)?${config.electionId}(?:\\D|$)`).test(heading))
    throw new Error('מזהה הבחירות בכותרת המקור אינו תואם להגדרות.');
  const summary = $('table.ResultsSummaryTable');
  if (summary.length !== 1) throw new Error('טבלת הסיכום הרשמית חסרה או שונתה.');
  const headers = summary
    .find('th')
    .toArray()
    .map((e) => clean($(e).text()));
  const values = summary
    .find('td')
    .toArray()
    .map((e) => clean($(e).text()));
  if (headers.length !== values.length) throw new Error('עמודות הסיכום אינן עקביות.');
  const read = (pattern: RegExp, required = false): number | null => {
    const matches = headers.map((h, i) => (pattern.test(h) ? i : -1)).filter((i) => i >= 0);
    if (matches.length !== 1) {
      if (required || matches.length) throw new Error(`עמודת סיכום חסרה או כפולה: ${pattern}`);
      return null;
    }
    return count(values[matches[0]!]!, headers[matches[0]!]!);
  };
  const tables = $('table.TableData');
  if (tables.length !== 1) throw new Error('טבלת הרשימות הרשמית חסרה או שונתה.');
  const cols = tables
    .find('thead th')
    .toArray()
    .map((e) => clean($(e).text()));
  const index = (pattern: RegExp): number => {
    const i = cols.findIndex((h) => pattern.test(h));
    if (i < 0) throw new Error(`עמודת רשימות חסרה: ${pattern}`);
    return i;
  };
  const nameIdx = index(/^שם הרשימה/),
    ballotIdx = index(/^אותיות הרשימה/),
    votesIdx = index(/^מספר הקולות הכשרים/);
  const mandatesIdx = cols.findIndex((h) => h === 'מנדטים');
  const parties: PartyVotes[] = [];
  tables.find('tr').each((_, row) => {
    const cells = $(row).find('td');
    if (!cells.length) return;
    if (cells.length !== cols.length) throw new Error('שורת רשימה חסרה או בעלת מבנה חדש.');
    const ballot = clean(cells.eq(ballotIdx).text());
    const name = clean(cells.eq(nameIdx).text());
    if (!ballot || !name) throw new Error('שם או אותיות רשימה חסרים.');
    parties.push({
      id: ballot,
      ballot,
      name,
      votes: count(cells.eq(votesIdx).text(), ballot),
      officialSeats:
        mandatesIdx < 0 ? null : count(cells.eq(mandatesIdx).text(), `מנדטים ${ballot}`),
    });
  });
  // The official export is a window.open URL in an HTML-encoded attribute.
  // Extract its literal URL; never execute source JavaScript.
  const anchor = $('a[id$="DownloadCSVCities"]');
  const link = `${anchor.attr('href') ?? ''} ${anchor.attr('onclick') ?? ''}`;
  const extracted = link.match(/https:\/\/[^\s'"<>]+\.csv(?:\?[^\s'"<>]*)?/i)?.[0];
  if (!extracted) throw new Error('קישור קובץ היישובים הרשמי חסר או שונה.');
  const url = new URL(extracted);
  const source = new URL(config.sourceUrl);
  if (
    url.protocol !== 'https:' ||
    !(url.hostname === source.hostname || url.hostname.endsWith('.bechirot.gov.il'))
  )
    throw new Error('קישור הייצוא אינו מקור רשמי מאושר.');
  const statusText = clean($('h3.LastUpdate').text());
  return {
    parties,
    validVotes: read(/הקולות הכשרים/, true)!,
    invalidVotes: read(/הקולות הפסולים/),
    votesCast: read(/קולות שהוזנו/),
    eligibleVoters: read(/בעלי זכות בחירה/),
    status: /סופיות רשמיות/.test(statusText)
      ? 'final'
      : /זמני|ארעי|ביניים/.test(statusText)
        ? 'provisional'
        : 'unknown',
    csvUrl: url.href,
  };
}

const metadata = ['סמל ועדה', 'שם ישוב', 'סמל ישוב', 'בזב', 'מצביעים', 'פסולים', 'כשרים'];
export function normalizeOfficial(
  html: string,
  csv: string,
  config: ElectionConfig,
  retrievedAt: string,
): ElectionSnapshot {
  const national = parseNationalHtml(html, config);
  const records = parse(csv, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as string[][];
  const headers = records.shift()?.map(clean);
  if (!headers || new Set(headers).size !== headers.length)
    throw new Error('כותרות CSV חסרות או כפולות.');
  for (const key of metadata)
    if (!headers.includes(key)) throw new Error(`עמודת CSV רשמית חסרה: ${key}`);
  const ballots = national.parties.map((p) => p.ballot);
  const csvBallots = headers.filter((h) => !metadata.includes(h));
  if (csvBallots.length !== ballots.length || csvBallots.some((b) => !ballots.includes(b)))
    throw new Error('רשימות ה־CSV אינן תואמות לרשימות בטבלה הארצית.');
  if (!records.length) throw new Error('קובץ היישובים ריק.');
  const sums: Record<string, number> = Object.fromEntries(
    headers.filter((h) => !metadata.slice(0, 3).includes(h)).map((h) => [h, 0]),
  );
  const places = new Set<string>();
  for (const row of records) {
    if (row.length !== headers.length) throw new Error('רוחב שורת CSV אינו תקין.');
    const record = Object.fromEntries(headers.map((h, i) => [h, clean(row[i]!)]));
    const place = `${record['סמל ועדה']}:${record['סמל ישוב']}`;
    if (!record['שם ישוב'] || !record['סמל ישוב'] || places.has(place))
      throw new Error('יישוב חסר או כפול בקובץ הרשמי.');
    places.add(place);
    const numbers: Record<string, number> = {};
    for (const key of Object.keys(sums)) {
      numbers[key] = count(record[key]!, key);
      sums[key] = sums[key]! + numbers[key]!;
      if (!Number.isSafeInteger(sums[key])) throw new Error('סכום CSV גדול מדי.');
    }
    if (numbers['מצביעים'] !== numbers['כשרים']! + numbers['פסולים']!)
      throw new Error(`סיכום מצביעים לא עקבי ביישוב ${record['שם ישוב']}.`);
    if (csvBallots.reduce((n, b) => n + numbers[b]!, 0) !== numbers['כשרים'])
      throw new Error(`סכום רשימות לא עקבי ביישוב ${record['שם ישוב']}.`);
  }
  for (const [key, expected] of [
    ['כשרים', national.validVotes],
    ['פסולים', national.invalidVotes],
    ['מצביעים', national.votesCast],
    ['בזב', national.eligibleVoters],
  ] as const) {
    if (expected !== null && sums[key] !== expected)
      throw new Error(`אי־התאמה בין CSV לטבלה הארצית: ${key}. ממתינים לפרסום עקבי.`);
  }
  const warnings: string[] = [];
  for (const party of national.parties) {
    if (party.votes !== sums[party.ballot])
      throw new Error(`קולות הרשימה ${party.ballot} שונים בין המקורות הרשמיים.`);
    if (!config.expectedBallots.includes(party.ballot))
      warnings.push(
        `רשימה חדשה במקור: ${party.ballot}. כל קולותיה נכללו; יש לבדוק את הגדרות הבחירות.`,
      );
  }
  const missing = config.expectedBallots.filter((b) => !ballots.includes(b));
  if (missing.length) throw new Error(`רשימות צפויות חסרות במקור: ${missing.join(', ')}.`);
  const snapshot: ElectionSnapshot = {
    electionId: config.electionId,
    electionName: config.electionName,
    sourceUrl: config.sourceUrl,
    status: national.status,
    mode: 'official',
    validVotes: national.validVotes,
    invalidVotes: national.invalidVotes ?? sums['פסולים']!,
    votesCast: national.votesCast ?? sums['מצביעים']!,
    eligibleVoters: national.eligibleVoters ?? sums['בזב']!,
    officialUpdatedAt: null,
    retrievedAt,
    reportingProgress: null,
    parties: national.parties,
    warnings,
  };
  assertSnapshot(snapshot, config);
  return snapshot;
}

export function assertSnapshot(snapshot: ElectionSnapshot, config: ElectionConfig): void {
  const errors = validateElectionInput(snapshot, config);
  for (const n of [snapshot.invalidVotes, snapshot.votesCast, snapshot.eligibleVoters])
    if (n !== null && (!Number.isSafeInteger(n) || n < 0)) errors.push('סיכום ארצי לא תקין.');
  if (
    snapshot.votesCast !== null &&
    snapshot.invalidVotes !== null &&
    snapshot.validVotes + snapshot.invalidVotes !== snapshot.votesCast
  )
    errors.push('קולות כשרים ופסולים אינם מסתכמים במספר המצביעים.');
  if (
    snapshot.votesCast !== null &&
    snapshot.eligibleVoters !== null &&
    snapshot.votesCast > snapshot.eligibleVoters
  )
    errors.push('מספר המצביעים גדול ממספר בעלי זכות הבחירה.');
  if (!Number.isFinite(Date.parse(snapshot.retrievedAt))) errors.push('זמן שליפה לא תקין.');
  if (
    snapshot.officialUpdatedAt !== null &&
    !Number.isFinite(Date.parse(snapshot.officialUpdatedAt))
  )
    errors.push('זמן עדכון רשמי לא תקין.');
  if (
    snapshot.reportingProgress !== null &&
    (!Number.isFinite(snapshot.reportingProgress) ||
      snapshot.reportingProgress < 0 ||
      snapshot.reportingProgress > 100)
  )
    errors.push('אחוז דיווח לא תקין.');
  if (errors.length) throw new Error(errors.join(' '));
}

export interface ElectionSourceAdapter {
  fetchSnapshot(config: ElectionConfig): Promise<ElectionSnapshot>;
}
interface ArchivedNationalPage {
  html: string;
  capturedAt: string;
}
class SourceFetchError extends Error {}

export class OfficialSourceClient {
  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly timeoutMs = 20000,
  ) {}
  protected async text(url: string): Promise<string> {
    try {
      const response = await this.request(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          Accept: 'text/html,text/csv;q=0.9,*/*;q=0.5',
          'User-Agent': 'KnessetResultsDashboard/1.0',
        },
      });
      if (!response.ok) throw new Error(`המקור הרשמי החזיר HTTP ${response.status}.`);
      if (response.headers.get('x-amzn-waf-action'))
        throw new Error('הגנת האתר הרשמי דורשת אימות דפדפן.');
      const body = await response.text();
      if (!body || body.length > 8_000_000) throw new Error('גודל תשובת המקור אינו תקין.');
      return body;
    } catch (error) {
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      const detail = timeout
        ? `תם זמן ההמתנה למקור (${this.timeoutMs / 1000} שניות). בדקו נגישות מהאזור שבו השרת מתארח.`
        : error instanceof Error
          ? error.message
          : 'שגיאת רשת';
      throw new SourceFetchError(`שליפת הנתונים מ־${new URL(url).hostname} נכשלה: ${detail}`, {
        cause: error,
      });
    }
  }
}

export class Official2022Adapter extends OfficialSourceClient implements ElectionSourceAdapter {
  constructor(
    request: typeof fetch = fetch,
    timeoutMs = 20000,
    private readonly now = () => new Date(),
    private readonly archivedNational?: () => Promise<ArchivedNationalPage>,
  ) {
    super(request, timeoutMs);
  }
  async fetchSnapshot(config: ElectionConfig): Promise<ElectionSnapshot> {
    let html: string;
    let archived: ArchivedNationalPage | null = null;
    try {
      html = await this.text(config.sourceUrl);
    } catch (error) {
      const source = new URL(config.sourceUrl);
      // This reference applies only to the completed 2022 election. Never use it
      // for a future election, a different endpoint, or malformed live results.
      if (
        !(error instanceof SourceFetchError) ||
        !this.archivedNational ||
        config.electionId !== '25' ||
        source.origin !== 'https://votes25.bechirot.gov.il' ||
        !['/', '/nationalresults'].includes(source.pathname) ||
        source.search
      )
        throw error;
      archived = await this.archivedNational();
      html = archived.html;
      if (
        !Number.isFinite(Date.parse(archived.capturedAt)) ||
        parseNationalHtml(html, config).status !== 'final'
      )
        throw new Error('עותק דף התוצאות הסופיות אינו תקין.');
    }
    const csvUrl = parseNationalHtml(html, config).csvUrl;
    if (archived && csvUrl !== 'https://media25.bechirot.gov.il/files/expc.csv?')
      throw new Error('כתובת קובץ היישובים אינה תואמת למקור השמור של 2022.');
    const csv = await this.text(csvUrl);
    if (/^\s*(?:<!doctype\s+html|<html(?:\s|>))/i.test(csv))
      throw new Error(
        `המקור הרשמי ${new URL(csvUrl).hostname} החזיר דף HTML במקום קובץ CSV. הנתונים לא עודכנו; ניתן לנסות לרענן שוב מאוחר יותר.`,
      );
    const snapshot = normalizeOfficial(html, csv, config, this.now().toISOString());
    if (archived) {
      snapshot.sourceUrl = csvUrl;
      snapshot.warnings.push(
        `העמוד הארצי אינו זמין לשליפה מהשרת. קובץ היישובים הרשמי נשלף כעת, וכל הסיכומים וקולות הרשימות אומתו מול דף התוצאות הסופיות של 2022 שנשמר ב־${archived.capturedAt}.`,
      );
    }
    return snapshot;
  }
}
