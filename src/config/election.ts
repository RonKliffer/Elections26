import type { ElectionConfig } from '@/lib/types';

// Election-specific ballot letters are identifiers. Replace this roster and its
// agreements together when the 2026 source and official lists are available.
export const electionConfig: ElectionConfig = {
  electionId: '25',
  electionName: 'הבחירות לכנסת ה־25 · 2022',
  sourceUrl: process.env.ELECTION_SOURCE_URL || 'https://votes25.bechirot.gov.il',
  testing: true,
  electoralThreshold: { numerator: 13, denominator: 400 },
  totalSeats: 120,
  surplusAgreements: [
    ['מחל', 'ט'],
    ['פה', 'כן'],
    ['שס', 'ג'],
    ['אמת', 'מרצ'],
  ],
  parties: {
    מחל: { label: 'הליכוד', color: '#355b98' },
    פה: { label: 'יש עתיד', color: '#4d7990' },
    ט: { label: 'הציונות הדתית', color: '#706d9e' },
    כן: { label: 'המחנה הממלכתי', color: '#477a84' },
    שס: { label: 'ש״ס', color: '#916f3c' },
    ג: { label: 'יהדות התורה', color: '#786b5e' },
    ל: { label: 'ישראל ביתנו', color: '#80668d' },
    עם: { label: 'רע״ם', color: '#457f68' },
    ום: { label: 'חד״ש–תע״ל', color: '#a2616a' },
    אמת: { label: 'העבודה', color: '#9a6956' },
    מרצ: { label: 'מרצ', color: '#61795c' },
    ד: { label: 'בל״ד', color: '#737085' },
    ב: { label: 'הבית היהודי', color: '#6a7584' },
  },
  expectedBallots: [
    'אמת',
    'אצ',
    'ב',
    'ג',
    'ד',
    'ום',
    'ז',
    'זך',
    'זנ',
    'זץ',
    'ט',
    'י',
    'יז',
    'ינ',
    'יץ',
    'יק',
    'כן',
    'ך',
    'ל',
    'מחל',
    'מרצ',
    'נז',
    'ני',
    'נף',
    'נץ',
    'נק',
    'נר',
    'עם',
    'פה',
    'ף',
    'צ',
    'ץ',
    'ק',
    'קי',
    'קך',
    'קנ',
    'קץ',
    'רז',
    'שס',
    'ת',
  ],
  blocs: [],
  thresholdWatchDistance: 0.5,
};

export function partyLabel(id: string, config: ElectionConfig, fallback = id): string {
  return config.parties[id]?.label ?? fallback;
}
export function partyColor(id: string, config: ElectionConfig): string {
  const palette = ['#61778c', '#8e6d62', '#677960', '#7e6b8f', '#497d82'];
  const hash = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
  return config.parties[id]?.color ?? palette[hash % palette.length]!;
}
