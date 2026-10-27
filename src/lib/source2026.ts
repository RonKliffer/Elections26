import { load } from 'cheerio';
import { assertSnapshot, OfficialSourceClient, type ElectionSourceAdapter } from './source';
import type { ElectionConfig, ElectionSnapshot, PartyVotes } from './types';

const clean = (value: string) =>
  value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
function count(value: string, label: string): number {
  const normalized = clean(value).replaceAll(',', '');
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(Number(normalized)))
    throw new Error(`נתון לא תקין (${label}): ${value.slice(0, 60)}`);
  return Number(normalized);
}

// The source's clock is local to Israel. Validate using the IANA timezone so
// winter/summer dates do not inherit the deployment server's timezone.
function publicationTime(text: string): string | null {
  const matches = [
    ...text.matchAll(/תוצאות נכון ל[־\- ]*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/g),
  ];
  if (!matches.length) return null;
  if (matches.length !== 1) throw new Error('זמן העדכון הרשמי כפול.');
  const [, day, month, year, hour, minute] = matches[0]!;
  const local = `${year}-${month}-${day}T${hour}:${minute}:00`;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const candidates = ['+02:00', '+03:00']
    .map((offset) => new Date(local + offset))
    .filter((date) => {
      if (!Number.isFinite(date.getTime())) return false;
      const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
      return (
        parts.year === year &&
        parts.month === month &&
        parts.day === day &&
        parts.hour === hour &&
        parts.minute === minute
      );
    });
  if (candidates.length !== 1) throw new Error('זמן העדכון הרשמי אינו תקין או אינו חד־משמעי.');
  return candidates[0]!.toISOString();
}

export function normalizeOfficial2026(
  html: string,
  config: ElectionConfig,
  retrievedAt: string,
): ElectionSnapshot {
  const $ = load(html);
  if (config.electionId !== '26' || !/ה[־\- ]*26(?:\D|$)/.test(clean($('h1').text())))
    throw new Error('מזהה הבחירות בכותרת המקור אינו תואם להגדרות.');

  const summary = $('[id$="_ShowTotal1_TotalTags"]');
  if (summary.length !== 1) throw new Error('סיכום התוצאות הרשמי חסר או שונה.');
  const fields = summary
    .find('.info-box')
    .toArray()
    .map((box) => {
      const value = $(box).find('.fw-bold.fs-2');
      if (value.length !== 1) throw new Error('מבנה נתוני הסיכום הרשמי השתנה.');
      return { label: clean(value.prev().text()), value: value.text() };
    });
  const read = (pattern: RegExp): number => {
    const matches = fields.filter((field) => pattern.test(field.label));
    if (matches.length !== 1) throw new Error(`נתון סיכום חסר או כפול: ${pattern}`);
    return count(matches[0]!.value, matches[0]!.label);
  };

  // Only the desktop table is parsed. The mobile cards repeat the same votes.
  const table = $('table').filter(
    (_, element) => $(element).find('thead th[id$="_validVotesForParty"]').length > 0,
  );
  if (table.length !== 1) throw new Error('טבלת הרשימות הרשמית חסרה או שונתה.');
  const headers = table
    .find('thead th')
    .toArray()
    .map((element) => clean($(element).text()));
  const column = (pattern: RegExp): number => {
    const matches = headers
      .map((header, index) => (pattern.test(header) ? index : -1))
      .filter((i) => i >= 0);
    if (matches.length !== 1) throw new Error(`עמודת רשימות חסרה או כפולה: ${pattern}`);
    return matches[0]!;
  };
  const nameIndex = column(/^שם הרשימה$/);
  const ballotIndex = column(/^אותיות הרשימה$/);
  const votesIndex = column(/^קולות כשרים לרשימה$/);
  const seatsIndex = headers.indexOf('מנדטים');
  const parties: PartyVotes[] = table
    .find('tbody tr')
    .toArray()
    .map((row) => {
      const cells = $(row).children('td');
      if (cells.length !== headers.length) throw new Error('שורת רשימה חסרה או בעלת מבנה חדש.');
      const ballot = clean(cells.eq(ballotIndex).text());
      return {
        id: ballot,
        ballot,
        name: clean(cells.eq(nameIndex).text()),
        votes: count(cells.eq(votesIndex).text(), ballot),
        officialSeats:
          seatsIndex < 0 ? null : count(cells.eq(seatsIndex).text(), `מנדטים ${ballot}`),
      };
    });
  const missing = config.expectedBallots.filter(
    (ballot) => !parties.some((p) => p.ballot === ballot),
  );
  if (missing.length) throw new Error(`רשימות צפויות חסרות במקור: ${missing.join(', ')}.`);
  const statusText = clean($('.fs-h3-title').text());
  const ruleText = clean($('#ruleMsg, #ruleMsgMobile').text());
  const snapshot: ElectionSnapshot = {
    electionId: config.electionId,
    electionName: config.electionName,
    sourceUrl: config.sourceUrl,
    status: /תוצאות סופיות/.test(statusText)
      ? 'final'
      : /עשויות התוצאות להשתנות/.test(ruleText) || /ארעי|ביניים|זמני/.test(statusText)
        ? 'provisional'
        : 'unknown',
    mode: 'official',
    validVotes: read(/^קולות כשרים(?: עד עתה)?$/),
    invalidVotes: read(/^קולות פסולים(?: עד עתה)?$/),
    votesCast: read(/^קולות עד עתה$/),
    eligibleVoters: read(/^מספר בעלי זכות בחירה$/),
    officialUpdatedAt: publicationTime(statusText),
    retrievedAt,
    reportingProgress: null,
    parties,
    warnings: parties
      .filter((p) => !config.parties[p.ballot])
      .map((p) => `רשימה חדשה במקור: ${p.ballot}. כל קולותיה נכללו; יש לבדוק את הגדרות הבחירות.`),
  };
  assertSnapshot(snapshot, config);
  return snapshot;
}

export class Official2026Adapter extends OfficialSourceClient implements ElectionSourceAdapter {
  constructor(
    request: typeof fetch = fetch,
    timeoutMs = 20000,
    private readonly now = () => new Date(),
    private readonly browserFallback?: ElectionSourceAdapter,
  ) {
    super(request, timeoutMs);
  }
  async fetchSnapshot(config: ElectionConfig): Promise<ElectionSnapshot> {
    // The national page supplies all counts in a single publication. A second,
    // independently published CSV is unnecessary for this adapter.
    let html: string;
    try {
      html = await this.text(config.sourceUrl);
    } catch (error) {
      if (!this.browserFallback) throw error;
      try {
        return await this.browserFallback.fetchSnapshot(config);
      } catch (browserError) {
        throw new Error(
          `${error instanceof Error ? error.message : 'שליפת המקור נכשלה.'} גם השליפה דרך דפדפן לא הצליחה: ${browserError instanceof Error ? browserError.message : 'שגיאת דפדפן'}`,
          { cause: browserError },
        );
      }
    }
    return normalizeOfficial2026(html, config, this.now().toISOString());
  }
}
