'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  DashboardState,
  ElectionCalculation,
  ElectionConfig,
  NextSeatResult,
  PartyCalculation,
  Rational,
} from '@/lib/types';
import { partyColor, partyLabel } from '@/config/election';
import { fraction, fullTime, number, signed, time } from '@/lib/format';
import { publishedSeatWarnings } from '@/lib/engine';
import Info from './Info';
function Exact({ value }: { value: Rational | null }) {
  return (
    <bdi className="num exact" dir="ltr">
      {fraction(value)}
    </bdi>
  );
}
function PartyName({ party, config }: { party: PartyCalculation; config: ElectionConfig }) {
  return (
    <span className="party-name" title={party.name}>
      <span className="party-dot" style={{ background: partyColor(party.id, config) }} />
      <span className="party-text">{partyLabel(party.id, config, party.name)}</span>
    </span>
  );
}
function Metric({
  label,
  value,
  sub,
  extraSub,
  warning = false,
}: {
  label: string;
  value: string;
  sub: string;
  extraSub?: string;
  warning?: boolean;
}) {
  return (
    <div className={`metric ${warning ? 'metric-warm' : ''}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value num" dir="ltr">
        {value}
      </div>
      <div className="metric-sub">{sub}</div>
      {extraSub && <div className="metric-sub">{extraSub}</div>}
    </div>
  );
}
const connectionLabels = {
  loading: 'מתחברים למקור',
  fresh: 'השליפה האחרונה הצליחה',
  stale: 'נתונים שמורים · חיבור מושהה',
  error: 'המקור אינו זמין',
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'results' | 'exact'>('results');
  // Hand-set seat counts for what-if play; null shows the computed allocation.
  // Kept only for this visit so a reload never shows invented numbers.
  const [sim, setSim] = useState<Record<string, number> | null>(null);
  const inFlight = useRef(false);
  const load = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(manual ? '/api/refresh' : '/api/results', {
        method: manual ? 'POST' : 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(45000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((await response.json()) as DashboardState);
      setClientError(null);
    } catch {
      setClientError('לא ניתן להתחבר לשרת האפליקציה. הנתונים האחרונים נשמרו על המסך.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const snapshot = data?.snapshot,
    calc = data?.calculation;
  const health = clientError
    ? data?.snapshot
      ? 'stale'
      : 'error'
    : (data?.connection ?? 'loading');
  const warnings = [
    ...new Set([...(snapshot?.warnings ?? []), ...(calc ? publishedSeatWarnings(calc) : [])]),
  ];
  const allocated = calc?.status === 'ok';
  // The source publishes no counting progress of its own, so votes entered are
  // measured against all eligible voters.
  const counted =
    snapshot?.reportingProgress ??
    (snapshot?.votesCast != null && snapshot.eligibleVoters
      ? (snapshot.votesCast / snapshot.eligibleVoters) * 100
      : null);
  return (
    <>
      <a className="skip-link" href="#main">
        דלג לתוכן
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="/" aria-label="עד 120 — דף הבית">
            <span className="brand-symbol" aria-hidden="true">
              120
            </span>
            <span>
              עד <strong>120</strong>
              <small>תמונת הבחירות לכנסת</small>
            </span>
          </a>
          <div className="header-context">
            <span>בחירות 2026</span>
            <span className="testing-badge">
              {data?.config.testing === false
                ? 'תוצאות רשמיות · חישוב עצמאי'
                : 'סביבת בדיקה · נתוני 2022'}
            </span>
          </div>
          <div
            className={`connection ${health} ${snapshot?.mode === 'demo' ? 'demo' : ''}`}
            role="status"
          >
            <span className="connection-dot" />
            {snapshot?.mode === 'demo'
              ? 'הדגמה מקומית · ללא חיבור למקור'
              : connectionLabels[health]}
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[1680px] px-4 md:px-7 pb-12">
        <section className="page-heading">
          <div>
            <div className="eyebrow">{data?.config.electionName ?? 'תוצאות הבחירות הארציות'}</div>
            <h1>תוצאות הבחירות לכנסת</h1>
            {snapshot && (counted !== null || snapshot.status === 'final') && (
              <p className="count-progress">
                נספרו{' '}
                <strong className="num">
                  {snapshot.status === 'final' ? '100' : number(counted, 1)}%
                </strong>{' '}
                מהקולות
              </p>
            )}
            <p>נתוני ועדת הבחירות המרכזית, עם חלוקת מנדטים עצמאית ושקופה.</p>
          </div>
          <div className="heading-actions">
            <span className={`status-badge ${snapshot?.mode === 'demo' ? 'demo' : ''}`}>
              {snapshot?.mode === 'demo'
                ? 'הדגמה לא מקוונת'
                : snapshot?.status === 'final'
                  ? 'המקור פרסם תוצאות סופיות'
                  : snapshot?.status === 'provisional'
                    ? 'תוצאות ביניים'
                    : 'סטטוס פרסום טרם זוהה'}
            </span>
            <button
              className="refresh-button"
              onClick={() => void load(true)}
              disabled={busy || data?.refreshing}
              aria-label="רענון התוצאות"
            >
              <span aria-hidden="true" className={busy ? 'refreshing' : ''}>
                ↻
              </span>{' '}
              {busy ? 'מרעננים…' : 'רענון נתונים'}
            </button>
          </div>
        </section>
        <div className="source-strip">
          <span>רענון בטעינת הדף ובלחיצה על רענון · ללא עדכון אוטומטי</span>
          <span>
            שליפה מוצלחת:{' '}
            <bdi className="num">
              {snapshot ? fullTime(snapshot.retrievedAt) : 'ממתינים לנתונים'}
            </bdi>
          </span>
          <span>
            עדכון במקור: <bdi className="num">{time(snapshot?.officialUpdatedAt)}</bdi>
          </span>
          {snapshot && (
            <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">
              למקור הרשמי ↗
            </a>
          )}
        </div>
        {(data?.error || clientError) && (
          <div className="notice notice-error" role="alert">
            <strong>
              {snapshot ? 'הנתונים המוצגים הם השליפה התקינה האחרונה.' : 'אין עדיין נתונים להצגה.'}
            </strong>{' '}
            {clientError ?? data?.error}
            {!clientError && data?.nextAllowedRefreshAt && (
              <span>
                {' '}
                ניתן לנסות לרענן שוב החל מ־<bdi>{time(data.nextAllowedRefreshAt)}</bdi>.
              </span>
            )}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="notice notice-warning" role="status">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
        {calc && calc.status !== 'ok' && (
          <div className="notice notice-error" role="alert">
            אין חלוקת מנדטים מלאה: {calc.diagnostics.join(' ')}
          </div>
        )}
        {!snapshot || !calc ? (
          <div className="loading-panel panel" aria-live="polite">
            <div className="loading-mark">120</div>
            <h2>{health === 'error' ? 'ממתינים לחיבור תקין' : 'טוענים את תמונת הבחירות'}</h2>
            <p>הנתונים יופיעו רק לאחר בדיקת עקביות מול המקור הרשמי.</p>
            {health === 'error' && (
              <p>לפיתוח לא מקוון ניתן לבחור במפורש במצב הדגמה בהגדרות השרת.</p>
            )}
          </div>
        ) : (
          <>
            <Blocs data={data!} sim={sim}>
              <ThresholdWatch calc={calc} data={data!} />
              <SeatChart calc={calc} data={data!} sim={sim} onSim={setSim} />
              <SeatEdge calc={calc} data={data!} />
            </Blocs>
            {!!data!.changes?.agreementChanges.length && (
              <div className="notice notice-warning" role="status">
                שינוי בהסכמי העודפים לעומת השליפה הקודמת:{' '}
                {data!.changes.agreementChanges.join('; ')}
              </div>
            )}
            <SurplusDetails calc={calc} config={data!.config} />
            <nav className="tabs" aria-label="תצוגות חישוב">
              <button
                aria-current={tab === 'results' ? 'page' : undefined}
                onClick={() => setTab('results')}
              >
                תמונת התוצאות
              </button>
              <button
                aria-current={tab === 'exact' ? 'page' : undefined}
                onClick={() => setTab('exact')}
              >
                חישוב מדויק והשוואה <span className="tab-label">בדר–עופר</span>
              </button>
              <span className="tab-caption">חישוב עצמאי · אינו אישור רשמי</span>
            </nav>
            {tab === 'results' ? (
              <>
                <PartyTable data={data!} />
              </>
            ) : (
              <ExactView data={data!} />
            )}
            <section className="metrics-grid" aria-label="נתונים ארציים">
              <Metric
                label="קולות כשרים"
                value={number(snapshot.validVotes)}
                sub={`${number(snapshot.votesCast)} קולות שהצביעו בפועל`}
                extraSub={`${number(snapshot.invalidVotes)} קולות פסולים`}
              />
              <Metric
                label="שיעור הצבעה כשרה"
                value={
                  snapshot.eligibleVoters
                    ? `${number((snapshot.validVotes / snapshot.eligibleVoters) * 100, 2)}%`
                    : '—'
                }
                sub={`${number(snapshot.eligibleVoters)} בעלי זכות בחירה`}
                extraSub={`${snapshot.votesCast !== null && snapshot.eligibleVoters ? `${number((snapshot.votesCast / snapshot.eligibleVoters) * 100, 2)}%` : '—'} שיעור הצבעה כולל`}
              />
              <Metric
                label="אחוז החסימה בקולות"
                value={number(calc.thresholdVotes)}
                sub={`${number((data!.config.electoralThreshold.numerator / data!.config.electoralThreshold.denominator) * 100, 2)}% מכל הקולות הכשרים`}
              />
              <Metric
                label="קולות מתחת לסף"
                value={number(calc.wastedVotes)}
                sub={`${number(calc.wastedPercentage, 2)}% מהקולות הכשרים`}
                warning
              />
            </section>
            <details className="panel data-details">
              <summary>סיכום ארצי ופרטי המקור</summary>
              <dl className="data-grid">
                {[
                  ['קולות כשרים', number(snapshot.validVotes)],
                  ['קולות פסולים', number(snapshot.invalidVotes)],
                  ['קולות שהוצבעו', number(snapshot.votesCast)],
                  ['בעלי זכות בחירה', number(snapshot.eligibleVoters)],
                  ['קולות לרשימות שעברו', number(calc.qualifyingVotes)],
                  ['קולות מתחת לסף', number(calc.wastedVotes)],
                  ['אחוז קולות מתחת לסף', `${number(calc.wastedPercentage, 2)}%`],
                  ['מנדטים ראשוניים', number(calc.initialSeats)],
                  ['מנדטי עודפים שחולקו', number(calc.surplusSeats)],
                  ['סך מושבים שחולקו', number(calc.totalSeats)],
                  ['מודד שלם לפי החוק', number(calc.statutoryQuota)],
                  [
                    'מכסה פשוטה ללא עיגול',
                    calc.simpleQuota
                      ? number(
                          Number(calc.simpleQuota.numerator) / Number(calc.simpleQuota.denominator),
                          4,
                        )
                      : '—',
                  ],
                  ['עדכון רשמי', time(snapshot.officialUpdatedAt)],
                  ['שליפה אחרונה', fullTime(snapshot.retrievedAt)],
                  [
                    'התקדמות דיווח',
                    snapshot.reportingProgress === null
                      ? 'לא פורסמה במקור'
                      : `${number(snapshot.reportingProgress, 2)}%`,
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd className="num">{value}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {allocated && (
              <p className="method-note">
                המנדטים מחושבים לפי המודד השלם והסכמי העודפים. תוספת הקולות היא תרחיש מתמטי שבו יתר
                הרשימות אינן משתנות, ואינה תחזית לקולות שטרם נספרו.
              </p>
            )}
          </>
        )}
        <footer>
          <span>
            עד 120 <span className="footer-divider">/</span> נתונים רשמיים. חישוב עצמאי.
          </span>
          <a
            href="https://main.knesset.gov.il/About/Lexicon/pages/seats.aspx"
            target="_blank"
            rel="noreferrer"
          >
            על שיטת בדר–עופר ↗
          </a>
        </footer>
      </main>
    </>
  );
}

type Camp = 'right' | 'left';
interface Split {
  seats: number;
  camp: Camp | null;
}
interface Scenario {
  name: string;
  right: string[];
  left: string[];
  // Defectors per party: they leave the party's camp and sit with their own.
  splits: Record<string, Split>;
}
// A bar segment: a whole party, or the defectors split off from one.
interface Unit {
  id: string;
  party: PartyCalculation;
  label: string;
  seats: number;
}
const campLabels: Record<Camp, string> = { right: 'גוש נתניהו', left: 'גוש השינוי' };
const campOptions = [
  ['right', 'נתניהו'],
  [null, 'ללא'],
  ['left', 'שינוי'],
] as const;
const splitSuffix = ':split';
function campStatus(seats: number, other: number, majority: number) {
  if (seats >= majority) return { label: 'רוב מוחלט', tone: 'absolute' };
  if (seats > other) return { label: 'רוב יחסי · ללא 61', tone: 'relative' };
  if (seats === other) return { label: 'תיקו', tone: 'none' };
  return null;
}
function CampSwitch({
  value,
  label,
  onChange,
}: {
  value: Camp | null;
  label: string;
  onChange: (camp: Camp | null) => void;
}) {
  return (
    <div className="camp-switch" role="radiogroup" aria-label={label}>
      {campOptions.map(([option, text]) => (
        <button
          key={text}
          role="radio"
          aria-checked={value === option}
          className={`camp-${option ?? 'middle'}`}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
// The national stats (children) sit between the bar and the party picker.
function Blocs({
  data,
  sim,
  children,
}: {
  data: DashboardState;
  sim: Record<string, number> | null;
  children: ReactNode;
}) {
  const config = data.config;
  const rank = (id: string) => {
    const i = config.partyOrder.indexOf(id);
    return i === -1 ? config.partyOrder.length : i;
  };
  const parties = data
    .calculation!.parties.map((p) => (sim ? { ...p, finalSeats: sim[p.id] ?? 0 } : p))
    .filter((p) => p.finalSeats > 0)
    .sort((a, b) => rank(a.id) - rank(b.id) || b.finalSeats - a.finalSeats);
  // Saved scenarios belong to the real roster, so a simulation never invalidates them.
  const roster = data
    .calculation!.parties.filter((p) => p.finalSeats > 0)
    .map((p) => p.id)
    .sort()
    .join('|');
  const key = `knesset-camps-v2-${config.electionId}`;
  const defaults = (): Scenario[] =>
    config.coalitions.map((c) => ({
      name: c.name,
      right: [...c.right],
      left: [...c.left],
      splits: {},
    }));
  const [scenarios, setScenarios] = useState<Scenario[]>(defaults);
  const [active, setActive] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  // The detailed picker starts collapsed; the bar above is the main way to move parties.
  const [pickerOpen, setPickerOpen] = useState(false);
  // The dragged segment follows the pointer; its camp changes only on release.
  const [drag, setDrag] = useState<{ id: string; startX: number; dx: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<(id: string, x: number) => void>(() => {});
  const dragging = drag !== null;
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null') as {
        roster?: string;
        scenarios?: unknown;
      } | null;
      if (
        value?.roster === roster &&
        Array.isArray(value.scenarios) &&
        value.scenarios.length === config.coalitions.length &&
        value.scenarios.every(
          (s: Scenario, i) =>
            s?.name === config.coalitions[i]!.name &&
            Array.isArray(s.right) &&
            Array.isArray(s.left) &&
            typeof s.splits === 'object',
        )
      )
        setScenarios(value.scenarios as Scenario[]);
    } catch {
      /* A corrupted browser preference must not affect election data. */
    }
    setHydrated(true);
    // The roster string is the stable identity for these preferences.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, roster]);
  useEffect(() => {
    if (hydrated) {
      try {
        localStorage.setItem(key, JSON.stringify({ roster, scenarios }));
      } catch {
        /* Browser storage may be disabled. */
      }
    }
  }, [key, roster, scenarios, hydrated]);
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => setDrag((d) => (d ? { ...d, dx: e.clientX - d.startX } : d));
    const up = (e: PointerEvent) => {
      setDrag((d) => {
        if (d && Math.abs(e.clientX - d.startX) > 5) dropRef.current(d.id, e.clientX);
        return null;
      });
    };
    const cancel = () => setDrag(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [dragging]);
  if (scenarios.length === 0) return null;

  const current = scenarios[Math.min(active, scenarios.length - 1)]!;
  const splitOf = (id: string): Split => {
    const split = current.splits[id];
    const max = (parties.find((p) => p.id === id)?.finalSeats ?? 1) - 1;
    return { seats: Math.max(0, Math.min(split?.seats ?? 0, max)), camp: split?.camp ?? null };
  };
  const partyCamp = (id: string): Camp | null =>
    current.right.includes(id) ? 'right' : current.left.includes(id) ? 'left' : null;
  const units: Unit[] = parties.flatMap((p) => {
    const split = splitOf(p.id);
    const label = partyLabel(p.id, config, p.name);
    const whole = { id: p.id, party: p, label, seats: p.finalSeats - split.seats };
    return split.seats
      ? [whole, { id: p.id + splitSuffix, party: p, label: `${label} · פיצול`, seats: split.seats }]
      : [whole];
  });
  const campOf = (unitId: string): Camp | null =>
    unitId.endsWith(splitSuffix)
      ? splitOf(unitId.slice(0, -splitSuffix.length)).camp
      : partyCamp(unitId);
  const seatsOf = (list: Unit[]) => list.reduce((n, u) => n + u.seats, 0);
  const majority = Math.floor(config.totalSeats / 2) + 1;
  // A simulation may not add up to the full house; the bar still spans its own total.
  const barSeats = seatsOf(units) || config.totalSeats;
  const camp = (side: Camp) => {
    const members = units.filter((u) => campOf(u.id) === side);
    const bloc = side === 'right' ? config.blocs[0] : config.blocs[config.blocs.length - 1];
    return {
      key: side,
      camp: side,
      name: campLabels[side],
      color: bloc?.color ?? (side === 'right' ? '#c0392b' : '#2563a8'),
      units: members,
      seats: seatsOf(members),
    };
  };
  const right = camp('right');
  const left = camp('left');
  // Units in neither camp share one gray middle group, still ordered by their party's bloc.
  const blocRank = (u: Unit) => {
    const i = config.blocs.findIndex((b) => b.partyIds.includes(u.party.id));
    return i === -1 ? config.blocs.length : i;
  };
  const free = units.filter((u) => !campOf(u.id)).sort((a, b) => blocRank(a) - blocRank(b));
  // With every party assigned, the empty middle stays as a drop zone for freeing one.
  const unassigned = {
    key: 'middle',
    camp: null,
    name: 'ללא שיוך',
    color: '#9aa5b1',
    units: free,
    seats: seatsOf(free),
  };
  const segments = [right, unassigned, left];
  const legend = [right, ...(unassigned.seats ? [unassigned] : []), left];
  const status = {
    right: campStatus(right.seats, left.seats, majority),
    left: campStatus(left.seats, right.seats, majority),
  };
  const update = (change: (s: Scenario) => Scenario) =>
    setScenarios((old) => old.map((s, i) => (i === active ? change(s) : s)));
  const setPartyCamp = (id: string, side: Camp | null) =>
    update((s) => ({
      ...s,
      right:
        side === 'right'
          ? [...s.right.filter((x) => x !== id), id]
          : s.right.filter((x) => x !== id),
      left:
        side === 'left' ? [...s.left.filter((x) => x !== id), id] : s.left.filter((x) => x !== id),
    }));
  const setSplit = (id: string, split: Split) =>
    update((s) => ({ ...s, splits: { ...s.splits, [id]: split } }));
  const setUnitCamp = (unitId: string, side: Camp | null) =>
    unitId.endsWith(splitSuffix)
      ? setSplit(unitId.slice(0, -splitSuffix.length), {
          ...splitOf(unitId.slice(0, -splitSuffix.length)),
          camp: side,
        })
      : setPartyCamp(unitId, side);
  // Dropping over a camp moves the unit into it; dropping in the middle frees it.
  const campAt = (x: number): Camp | null => {
    for (const side of ['right', 'left'] as const) {
      const r = barRef.current?.querySelector(`.bloc-camp-${side}`)?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right) return side;
    }
    return null;
  };
  dropRef.current = (id, x) => setUnitCamp(id, campAt(x));
  const hover = drag && Math.abs(drag.dx) > 5 ? campAt(drag.startX + drag.dx) : undefined;
  const bySeats = [...parties].sort((a, b) => b.finalSeats - a.finalSeats);
  return (
    <>
      <section className="panel blocs-panel" aria-label="תמונת הגושים">
        <div className="scenario-tabs" role="tablist" aria-label="תרחישי קואליציה">
          {scenarios.map((s, i) => (
            <button
              key={s.name}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
            >
              {s.name}
            </button>
          ))}
          <button className="text-button" onClick={() => setScenarios(defaults())}>
            איפוס
          </button>
          {sim && <span className="sim-badge">מנדטים בהדמיה</span>}
        </div>
        <div
          ref={barRef}
          className="bloc-bar"
          role="img"
          aria-label={legend.map((s) => `${s.name}: ${s.seats}`).join(', ')}
        >
          {segments.map((s) => (
            <div
              key={s.key}
              className={[
                'bloc-group',
                s.camp ? `bloc-camp bloc-camp-${s.camp}` : 'bloc-middle',
                hover !== undefined && hover === s.camp ? 'drop-target' : '',
              ].join(' ')}
              style={{ flexBasis: `${(s.seats / barSeats) * 100}%` }}
            >
              {s.units.map((u) => (
                <div
                  key={u.id}
                  data-party={u.id}
                  className={[
                    'bloc-party',
                    u.id.endsWith(splitSuffix) ? 'bloc-party-split' : '',
                    drag?.id === u.id ? 'dragged' : '',
                  ].join(' ')}
                  style={{
                    flexBasis: `${(u.seats / s.seats) * 100}%`,
                    backgroundColor: s.color,
                    transform: drag?.id === u.id ? `translateX(${drag.dx}px)` : undefined,
                  }}
                  title={`${u.label}: ${u.seats}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    setDrag({ id: u.id, startX: e.clientX, dx: 0 });
                  }}
                >
                  <span className="bloc-party-seats num">{u.seats}</span>
                  <span className="bloc-party-name">{u.label}</span>
                  {drag?.id === u.id && (
                    <span className="bloc-party-tag">
                      {u.label} · <bdi className="num">{u.seats}</bdi>
                    </span>
                  )}
                </div>
              ))}
              {s.seats > 0 && <span className="bloc-group-total num">{s.seats}</span>}
            </div>
          ))}
          {/* A camp that crosses the middle of the bar holds a majority. */}
          <span className="bloc-majority" />
          <span className="bloc-majority-label">{majority} לרוב</span>
        </div>
        <div className="bloc-legend">
          {legend.map((s) => {
            const badge = s.camp ? status[s.camp] : null;
            return (
              <div key={s.key} className={s.camp ? 'bloc-legend-camp' : ''}>
                <span className="bloc-swatch" style={{ background: s.color }} />
                <span className="bloc-name">{s.name}</span>
                <strong className="num">{s.seats}</strong>
                {badge && (
                  <span className={`scenario-status status-${badge.tone}`}>{badge.label}</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="bloc-hint">
          גררו מפלגה בפס כדי להעביר אותה בין המחנות ·{' '}
          <a href="#camp-picker" onClick={() => setPickerOpen(true)}>
            שיוך מפורט ופיצולים ↓
          </a>
        </p>
      </section>
      {children}
      <section id="camp-picker" className="panel camp-panel" aria-label="שיוך המפלגות">
        <button
          className="panel-heading camp-toggle"
          aria-expanded={pickerOpen}
          aria-controls="camp-body"
          onClick={() => setPickerOpen((open) => !open)}
        >
          <div>
            <div className="eyebrow">שיוך מפורט ופיצולים</div>
            <h2>{current.name}</h2>
          </div>
          <span className="camp-toggle-label">
            {pickerOpen ? 'הסתרה' : 'הצגה'} <span aria-hidden="true">{pickerOpen ? '▴' : '▾'}</span>
          </span>
        </button>
        {pickerOpen && (
          <div id="camp-body" className="camp-body">
            <p className="bloc-hint">
              לכל מפלגה: נתניהו, ללא או שינוי. בשדה „פיצול” אפשר להפריד עריקים ממפלגה ולשייך אותם
              למחנה אחר.
            </p>
            <div className="camp-picker" aria-label={`שיוך המפלגות: ${current.name}`}>
              {bySeats.map((p) => {
                const label = partyLabel(p.id, config, p.name);
                const split = splitOf(p.id);
                return (
                  <div key={p.id} className="camp-row">
                    <div className="camp-row-main">
                      <PartyName party={p} config={config} />
                      <bdi className="num">{p.finalSeats}</bdi>
                      <CampSwitch
                        value={partyCamp(p.id)}
                        label={`שיוך ${label}`}
                        onChange={(c) => setPartyCamp(p.id, c)}
                      />
                    </div>
                    <div className="camp-row-split">
                      <label>
                        פיצול
                        <input
                          type="number"
                          min={0}
                          max={p.finalSeats - 1}
                          value={split.seats}
                          onChange={(e) =>
                            setSplit(p.id, {
                              ...split,
                              seats: Math.max(
                                0,
                                Math.min(p.finalSeats - 1, Number(e.target.value) || 0),
                              ),
                            })
                          }
                        />
                      </label>
                      {split.seats > 0 && (
                        <>
                          <span>עריקים אל</span>
                          <CampSwitch
                            value={split.camp}
                            label={`שיוך העריקים מ${label}`}
                            onChange={(c) => setSplit(p.id, { ...split, camp: c })}
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
function SeatChart({
  calc,
  data,
  sim,
  onSim,
}: {
  calc: ElectionCalculation;
  data: DashboardState;
  sim: Record<string, number> | null;
  onSim: (sim: Record<string, number> | null) => void;
}) {
  const config = data.config;
  const real = Object.fromEntries(calc.parties.map((p) => [p.id, p.finalSeats]));
  const seatsOf = (id: string) => (sim ? (sim[id] ?? 0) : real[id]!);
  // While simulating, parties near the threshold can be given seats too.
  const parties = calc.parties
    .filter(
      (p) =>
        real[p.id]! > 0 ||
        (sim &&
          (seatsOf(p.id) > 0 || Math.abs(p.thresholdDistancePp) <= config.thresholdWatchDistance)),
    )
    .sort((a, b) => real[b.id]! - real[a.id]! || b.votes - a.votes);
  const total = sim ? Object.values(sim).reduce((n, v) => n + v, 0) : calc.totalSeats;
  const gap = config.totalSeats - total;
  const set = (id: string, seats: number) =>
    onSim({ ...(sim ?? real), [id]: Math.max(0, Math.min(config.totalSeats, seats)) });
  const changed = sim && calc.parties.some((p) => seatsOf(p.id) !== real[p.id]);
  return (
    <section className={`panel seat-panel ${sim ? 'seat-panel-sim' : ''}`}>
      <div className="panel-heading">
        <div>
          <div className="eyebrow">{sim ? 'הדמיה · לא תוצאה' : 'החלוקה המחושבת'}</div>
          <h2>תמונת המנדטים</h2>
          <p className="seat-quota">
            מודד למנדט: <strong className="num">{number(calc.statutoryQuota)}</strong> קולות
          </p>
        </div>
        <div className="seat-heading-side">
          <div className="seats-total">
            <strong className="num">{total}</strong>
            <span>/ {config.totalSeats} מושבים</span>
          </div>
          <div className="sim-controls">
            {sim && changed && (
              <button className="text-button" onClick={() => onSim({ ...real })}>
                איפוס
              </button>
            )}
            <button
              className={`sim-toggle ${sim ? 'active' : ''}`}
              aria-pressed={!!sim}
              onClick={() => onSim(sim ? null : { ...real })}
            >
              {sim ? 'סיום ההדמיה' : 'שינוי מנדטים להדמיה'}
            </button>
          </div>
        </div>
      </div>
      {sim && gap !== 0 && (
        <p className="sim-gap warning-text" role="status">
          {gap > 0 ? (gap === 1 ? 'חסר ' : 'חסרים ') : 'יש '}
          {Math.abs(gap) === 1 ? 'מנדט אחד' : `${Math.abs(gap)} מנדטים`}
          {gap > 0 ? ` להשלמת ${config.totalSeats}` : ` מעבר ל־${config.totalSeats}`}
        </p>
      )}
      <div className="seat-legend">
        {parties.map((p) => {
          const seats = seatsOf(p.id);
          const diff = seats - real[p.id]!;
          return (
            <div key={p.id} className={seats === 0 ? 'seat-empty' : ''}>
              <PartyName party={p} config={config} />
              {sim ? (
                <span className="sim-stepper">
                  <button
                    aria-label={`הוספת מנדט ל${partyLabel(p.id, config)}`}
                    onClick={() => set(p.id, seats + 1)}
                  >
                    +
                  </button>
                  <strong className="num">{seats}</strong>
                  <button
                    aria-label={`הורדת מנדט מ${partyLabel(p.id, config)}`}
                    disabled={seats === 0}
                    onClick={() => set(p.id, seats - 1)}
                  >
                    −
                  </button>
                  {diff !== 0 && (
                    <bdi className={`sim-diff num ${diff > 0 ? 'positive-text' : 'warning-text'}`}>
                      {signed(diff)}
                    </bdi>
                  )}
                </span>
              ) : (
                <strong className="num">{seats}</strong>
              )}
            </div>
          );
        })}
      </div>
      <div className="seat-foot">
        {sim ? (
          <span>
            הפס העליון וחלוקת הגושים מציגים את המנדטים שבהדמיה. שאר הנתונים בעמוד אמיתיים.
          </span>
        ) : (
          <>
            <span>
              <strong className="num">{calc.initialSeats}</strong> בהקצאה ראשונית
            </span>
            <span>
              <strong className="num">{calc.surplusSeats}</strong> בשלב העודפים
            </span>
            <span className={calc.status === 'ok' ? 'positive-text' : 'warning-text'}>
              {calc.status === 'ok' ? 'כל המושבים חולקו' : 'חלוקה לא הושלמה'}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

function SeatEdge({ calc, data }: { calc: ElectionCalculation; data: DashboardState }) {
  const closest = (results: Record<string, NextSeatResult>) =>
    calc.parties
      .flatMap((party) => {
        const r = results[party.id];
        return r?.status === 'ok' && r.additionalVotes !== null ? [{ party, r }] : [];
      })
      .sort((a, b) => a.r.additionalVotes! - b.r.additionalVotes!)
      .slice(0, 3);
  const columns = [
    { key: 'gain', title: 'הכי קרובות למנדט נוסף', sign: '+', items: closest(data.nextSeats) },
    { key: 'lose', title: 'הכי קרובות לאבד מנדט', sign: '−', items: closest(data.seatLosses) },
  ];
  return (
    <section className="panel seat-edge-panel">
      <div className="panel-heading">
        <h2>
          על הגבול: המנדט הבא{' '}
          <Info text="כמה קולות נוספים (או חסרים) לרשימה היו משנים את מספר המנדטים הסופי שלה, כולל השפעה על הסף ועל הסכמי העודפים. זו תוספת מתמטית, לא תחזית." />
        </h2>
      </div>
      <div className="seat-edge-grid">
        {columns.map((c) => (
          <div key={c.key} className={`seat-edge-col seat-edge-${c.key}`}>
            <h3>{c.title}</h3>
            {c.items.length ? (
              <ol>
                {c.items.map(({ party, r }) => (
                  <li key={party.id}>
                    <PartyName party={party} config={data.config} />
                    <span className="seat-edge-votes">
                      <strong className="num">
                        <bdi>
                          {c.sign}
                          {number(r.additionalVotes)}
                        </bdi>
                      </strong>{' '}
                      קולות
                    </span>
                    <span className="seat-edge-seats muted">
                      <bdi className="num" dir="ltr">
                        {party.finalSeats} → {r.targetSeats}
                      </bdi>
                      {r.targetSeats === 0 && ' · מתחת לסף'}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">אין חישוב זמין כרגע.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ThresholdWatch({ calc, data }: { calc: ElectionCalculation; data: DashboardState }) {
  const parties = calc.parties
    .filter((p) => Math.abs(p.thresholdDistancePp) <= data.config.thresholdWatchDistance)
    .sort((a, b) => b.votes - a.votes);
  return (
    <section className="panel threshold-panel">
      <div className="panel-heading threshold-heading">
        <h2>
          על קו החסימה{' '}
          <Info text="המרחק מתייחס לסף הנוכחי. לפני תום הספירה אין הבטחה שרשימה תישאר מעליו." />
        </h2>
        <div className="threshold-facts">
          <span>
            הצבעה כשרה:{' '}
            <strong className="num">
              {data.snapshot?.eligibleVoters
                ? `${number((data.snapshot.validVotes / data.snapshot.eligibleVoters) * 100, 2)}%`
                : '—'}
            </strong>
          </span>
          <span>
            אחוז החסימה: <strong className="num">{number(calc.thresholdVotes)}</strong> קולות
          </span>
          <span>
            קולות שהתבזבזו: <strong className="num">{number(calc.wastedVotes)}</strong> (
            <bdi className="num">{number(calc.wastedPercentage, 2)}%</bdi>
            {calc.statutoryQuota > 0 && (
              <>
                {' '}
                · כ־<bdi className="num">
                  {number(calc.wastedVotes / calc.statutoryQuota, 1)}
                </bdi>{' '}
                מנדטים
              </>
            )}
            )
          </span>
          <span className="muted">עד {data.config.thresholdWatchDistance} נקודת אחוז מהסף</span>
        </div>
      </div>
      <div className="threshold-cards">
        {parties.length ? (
          parties.map((p) => (
            <div key={p.id} className="threshold-card">
              <div>
                <PartyName party={p} config={data.config} />
                <strong className="num">{number(p.percentage, 2)}%</strong>
              </div>
              <div className="threshold-track">
                <span
                  className={p.qualifies ? 'above-track' : 'below-track'}
                  style={{ width: `${Math.min((p.votes / calc.thresholdVotes) * 85, 100)}%` }}
                />
                <i />
              </div>
              <div className="threshold-card-bottom">
                <span
                  className={`threshold-margin ${p.qualifies ? 'positive-text' : 'warning-text'}`}
                >
                  <strong className="num">{number(Math.abs(p.thresholdMargin))}</strong> קולות{' '}
                  {p.qualifies ? 'מעל הסף' : 'מתחת לסף'}
                </span>
                <bdi className="muted num">{signed(p.thresholdDistancePp, 3)} נ״א</bdi>
              </div>
              {data.changes?.parties[p.id]?.crossing && (
                <span className="crossing">
                  {p.qualifies ? 'עלתה מעל הסף בשליפה האחרונה' : 'ירדה מתחת לסף בשליפה האחרונה'}
                </span>
              )}
            </div>
          ))
        ) : (
          <p className="muted">אין כרגע רשימות בטווח המעקב.</p>
        )}
      </div>
    </section>
  );
}

function PartyTable({ data }: { data: DashboardState }) {
  const [sort, setSort] = useState<'votes' | 'seats' | 'threshold'>('votes');
  const [descending, setDescending] = useState(true);
  const [query, setQuery] = useState('');
  const [all, setAll] = useState(true);
  const [open, setOpen] = useState(true);
  const calc = data.calculation!,
    valid = calc.status === 'ok';
  const sortValue = (p: PartyCalculation) =>
    sort === 'votes' ? p.votes : sort === 'seats' ? p.finalSeats : Math.abs(p.thresholdMargin);
  const parties = calc.parties
    .filter(
      (p) =>
        (all || p.qualifies) &&
        `${p.name} ${p.ballot} ${partyLabel(p.id, data.config)}`.includes(query),
    )
    .sort(
      (a, b) =>
        (sortValue(a) - sortValue(b)) * (descending ? -1 : 1) ||
        b.votes - a.votes ||
        a.id.localeCompare(b.id),
    );
  const changeSort = (key: typeof sort) => {
    if (sort === key) setDescending((old) => !old);
    else {
      setSort(key);
      setDescending(key !== 'threshold');
    }
  };
  const sortButton = (key: typeof sort, label: string) => (
    <button className="sort-button" onClick={() => changeSort(key)}>
      {label}
      <span aria-hidden="true">{sort === key ? (descending ? ' ↓' : ' ↑') : ' ↕'}</span>
    </button>
  );
  return (
    <section className="panel results-panel">
      <div className="panel-heading table-heading">
        <div>
          <h2>
            תוצאות לפי רשימה <span className="count-label">{calc.parties.length} רשימות</span>
          </h2>
          <p className="muted">מכסה פשוטה, חלוקה ראשונית ועודפים — כל שלב בנפרד.</p>
        </div>
        {open && (
          <div className="table-controls">
            <input
              aria-label="חיפוש רשימה"
              placeholder="חיפוש לפי רשימה או אותיות…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label>
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
              כולל רשימות מתחת לסף
            </label>
          </div>
        )}
        <button
          className="table-toggle camp-toggle-label"
          aria-expanded={open}
          aria-controls="results-body"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'הסתרה' : 'הצגה'} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>
      {open && (
        <div id="results-body">
          <div className="table-scroll">
            <table className="results-table">
              <caption className="sr-only">תוצאות הרשימות וחלוקת המנדטים העצמאית</caption>
              <thead>
                <tr>
                  <th scope="col">רשימה</th>
                  <th scope="col">פתק</th>
                  <th
                    scope="col"
                    aria-sort={
                      sort === 'votes' ? (descending ? 'descending' : 'ascending') : 'none'
                    }
                  >
                    {sortButton('votes', 'קולות')}
                  </th>
                  <th scope="col">מהכשרים</th>
                  <th scope="col">
                    מכסה גולמית{' '}
                    <Info text="קולות הרשימה חלקי המכסה הפשוטה ללא עיגול. זהו מדד הסבר, לא מספר המנדטים הסופי." />
                  </th>
                  <th scope="col">ראשוני</th>
                  <th scope="col">עודפים</th>
                  <th
                    scope="col"
                    aria-sort={
                      sort === 'seats' ? (descending ? 'descending' : 'ascending') : 'none'
                    }
                  >
                    {sortButton('seats', 'סופי')}
                  </th>
                  <th scope="col">
                    פער פשוט{' '}
                    <Info text="החלק החסר למכסה הפשוטה הבאה, בין 0 ל־1. אינו המרחק למנדט סופי בשיטת בדר–עופר." />
                  </th>
                  <th scope="col">
                    תוספת קולות{' '}
                    <Info text="תרחיש מתמטי: מספר הקולות הנוספים להשגת מנדט סופי נוסף כאשר יתר הקולות קבועים. מתחת לסף מוצגת תוספת לחציית הסף עם מכנה ארצי שגדל." />
                  </th>
                  <th
                    scope="col"
                    aria-sort={
                      sort === 'threshold' ? (descending ? 'descending' : 'ascending') : 'none'
                    }
                  >
                    {sortButton('threshold', 'מרחק מהסף')}
                  </th>
                  <th scope="col">הסכם עודפים</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p) => {
                  const next = data.nextSeats[p.id];
                  const delta = data.changes?.parties[p.id];
                  return (
                    <tr key={p.id} className={!p.qualifies ? 'below-row' : ''}>
                      <th scope="row">
                        <PartyName party={p} config={data.config} />
                        {delta?.crossing && (
                          <small className="crossing">
                            {delta.crossing === 'above' ? 'חצתה את הסף ↑' : 'מתחת לסף ↓'}
                          </small>
                        )}
                      </th>
                      <td>
                        <span className="ballot">{p.ballot}</span>
                      </td>
                      <td className="num">
                        <bdi>{number(p.votes)}</bdi>
                        {delta?.votes ? (
                          <small className="delta num">
                            <bdi>{signed(delta.votes)}</bdi>
                          </small>
                        ) : null}
                      </td>
                      <td className="num">
                        <bdi>{number(p.percentage, 2)}%</bdi>
                      </td>
                      <td>
                        {p.qualifies ? (
                          <>
                            <bdi className="num">{number(p.rawSeatEquivalent, 2)}</bdi>
                            <div className="fraction-track">
                              <span
                                style={{
                                  width: `${(p.fractionEarned ?? 0) * 100}%`,
                                  background: partyColor(p.id, data.config),
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <span className="muted">מתחת לסף</span>
                        )}
                      </td>
                      <td className="num">
                        {valid ? p.initialSeats : '—'}
                        {delta?.initialSeats ? (
                          <small className="delta" title="שינוי בהקצאה הראשונית מהשליפה הקודמת">
                            <bdi>{signed(delta.initialSeats)}</bdi>
                          </small>
                        ) : null}
                      </td>
                      <td>
                        {valid && p.surplusSeats > 0 ? (
                          <span className="surplus-badge num">+{p.surplusSeats}</span>
                        ) : valid ? (
                          <span className="muted">0</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="final-cell">
                        <bdi className="num">{valid ? p.finalSeats : '—'}</bdi>
                        {delta?.finalSeats ? (
                          <small
                            className={
                              delta.finalSeats > 0 ? 'positive-text delta' : 'warning-text delta'
                            }
                          >
                            <bdi>{signed(delta.finalSeats)}</bdi>
                          </small>
                        ) : null}
                      </td>
                      <td className="num">
                        <bdi>{number(p.fractionMissing, 2)}</bdi>
                      </td>
                      <td className="extra-cell">
                        {next?.additionalVotes != null ? (
                          <>
                            <bdi className="num">+{number(next.additionalVotes)}</bdi>
                            <small>
                              {next.status === 'threshold'
                                ? 'לחציית הסף'
                                : `למנדט ${next.targetSeats}`}
                            </small>
                            {next.tieAtVotes !== undefined && (
                              <small className="warning-text" title={next.reason ?? undefined}>
                                ב־{number(next.tieAtVotes)} תלוי בהכרעה
                              </small>
                            )}
                          </>
                        ) : (
                          <span className="muted" title={next?.reason ?? 'אין חלוקה תקפה'}>
                            לא זמין
                          </span>
                        )}
                      </td>
                      <td className={p.qualifies ? 'positive-text num' : 'warning-text num'}>
                        <bdi>{signed(p.thresholdMargin)}</bdi>
                        <small>{p.qualifies ? 'מעל הסף כעת' : 'מתחת לסף כעת'}</small>
                      </td>
                      <td>
                        <span className="agreement-partner">
                          {p.agreementPartner ? partyLabel(p.agreementPartner, data.config) : '—'}
                        </span>
                        {p.agreementPartner && (
                          <small className="muted">
                            {calc.agreements.find((a) => a.parties.includes(p.id))?.active
                              ? 'פעיל'
                              : 'לא פעיל'}
                          </small>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {valid && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>
                      סך הכול
                    </th>
                    <td className="num">{number(data.snapshot!.validVotes)}</td>
                    <td className="num">100%</td>
                    <td>—</td>
                    <td className="num">{calc.initialSeats}</td>
                    <td className="num">{calc.surplusSeats}</td>
                    <td className="num">{calc.totalSeats}</td>
                    <td colSpan={4}>חלוקה מחושבת לפי המודד השלם</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {parties.length === 0 && <p className="empty-message">אין רשימות התואמות לחיפוש.</p>}
          <div className="table-note">
            <span className="tiny-dot" />
            מספרי הקולות מוצגים כפי שפורסמו. שינוי מוצג מול השליפה התקינה השונה הקודמת.
            {data.changes && (
              <span>
                {' '}
                בסיס ההשוואה: <bdi>{fullTime(data.changes.fromRetrievedAt)}</bdi>.
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function SurplusDetails({
  calc,
  config,
  expanded = false,
}: {
  calc: ElectionCalculation;
  config: ElectionConfig;
  expanded?: boolean;
}) {
  const label = (id: string) => partyLabel(id, config, calc.parties.find((p) => p.id === id)?.name);
  return (
    <details className="panel surplus-details" open={expanded || undefined}>
      <summary>
        <span>למה התקבל מנדט נוסף?</span>
        <span className="muted">הסכמי עודפים וסדר החלוקה · {calc.surplusSeats} מנדטים</span>
      </summary>
      <div className="details-content">
        <div className="agreement-grid">
          {calc.agreements.map((a) => (
            <div key={a.parties.join('|')} className="agreement-card">
              <div className="agreement-title">{a.parties.map(label).join(' + ')}</div>
              <span className={`small-badge ${a.active ? 'badge-active' : 'badge-inactive'}`}>
                {a.active ? 'הסכם פעיל' : 'אינו פעיל'}
              </span>
              <p className="muted">{a.reason}</p>
              <div className="agreement-numbers">
                <span>
                  <bdi className="num">{number(a.votes)}</bdi> קולות
                </span>
                <span>
                  <bdi className="num">{a.finalSeats}</bdi> מושבים יחד
                </span>
              </div>
              {a.active && (
                <small>
                  מודד פנימי: <Exact value={a.internalQuota} />
                </small>
              )}
            </div>
          ))}
        </div>
        {calc.rounds.length > 0 && (
          <div className="table-scroll">
            <table className="rounds-table">
              <caption>כל שלב בחלוקת העודפים</caption>
              <thead>
                <tr>
                  <th>מושב</th>
                  <th>היחידה הזוכה</th>
                  <th>מדד היחידה</th>
                  <th>הרשימה המקבלת</th>
                  <th>המדד האישי</th>
                </tr>
              </thead>
              <tbody>
                {calc.rounds.map((r) => (
                  <tr key={r.seat}>
                    <td className="num">{r.seat}</td>
                    <td>{r.unit.map(label).join(' + ')}</td>
                    <td>
                      <Exact value={r.indicator} />
                      <small className="muted num">
                        {number(Number(r.indicator.numerator) / Number(r.indicator.denominator), 4)}
                      </small>
                    </td>
                    <td>
                      <strong>{label(r.recipient)}</strong>
                    </td>
                    <td>
                      <Exact value={r.recipientIndicator} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {calc.status !== 'ok' && (
          <p className="warning-text">החלוקה נעצרה: {calc.diagnostics.join(' ')}</p>
        )}
      </div>
    </details>
  );
}

function ExactView({ data }: { data: DashboardState }) {
  const calc = data.calculation!,
    comparison = data.comparison!;
  return (
    <div className="exact-view">
      <section className="panel exact-intro">
        <div className="eyebrow">מספרים ללא קיצורי דרך</div>
        <h2>שני מודדים, שתי מטרות</h2>
        <p>
          החלוקה הראשית משתמשת במודד השלם שנקבע בחוק. המכסה הפשוטה שומרת את השבר לצורכי הבנה והשוואה
          בלבד.
        </p>
        <div className="exact-formulas">
          <div>
            <h3>מודד סטטוטורי</h3>
            <p>
              <bdi dir="ltr" className="num">
                floor({fraction(calc.simpleQuota)}) = {number(calc.statutoryQuota)}
              </bdi>
            </p>
            <span>משמש לחלוקת המנדטים הראשית</span>
          </div>
          <div>
            <h3>מכסה פשוטה ללא עיגול</h3>
            <p>
              <Exact value={calc.simpleQuota} /> ={' '}
              <bdi className="num">
                {calc.simpleQuota
                  ? number(
                      Number(calc.simpleQuota.numerator) / Number(calc.simpleQuota.denominator),
                      6,
                    )
                  : '—'}
              </bdi>
            </p>
            <span>משמשת למכסה הגולמית ולפער הפשוט</span>
          </div>
        </div>
        <div className="notice notice-warning">
          העמודות החלופיות הן השוואה מתמטית עם מכסה ללא עיגול, ולא חלוקה רשמית או תחזית. תרחישי
          תוספת הקולות מתייחסים לחלוקה הסטטוטורית בלבד.
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>השוואת החלוקות</h2>
          <span className="muted">הצגת שברים מדויקים לצד מספרי המושבים</span>
        </div>
        <div className="table-scroll">
          <table className="comparison-table">
            <thead>
              <tr>
                <th rowSpan={2}>רשימה</th>
                <th rowSpan={2}>מכסה גולמית מדויקת</th>
                <th colSpan={3}>סטטוטורי · ראשי</th>
                <th colSpan={3}>ללא עיגול · השוואה</th>
                <th rowSpan={2}>פער פשוט</th>
              </tr>
              <tr>
                <th>ראשוני</th>
                <th>עודפים</th>
                <th>סופי</th>
                <th>ראשוני</th>
                <th>עודפים</th>
                <th>סופי</th>
              </tr>
            </thead>
            <tbody>
              {calc.parties
                .filter((p) => p.qualifies)
                .map((p) => {
                  const alternate = comparison.parties.find((a) => a.id === p.id);
                  return (
                    <tr key={p.id}>
                      <th scope="row">
                        <PartyName party={p} config={data.config} />
                      </th>
                      <td>
                        <Exact value={p.rawSeatExact} />
                      </td>
                      <td>{p.initialSeats}</td>
                      <td>{p.surplusSeats}</td>
                      <td className="comparison-main">
                        {calc.status === 'ok' ? p.finalSeats : '—'}
                      </td>
                      <td>{alternate?.initialSeats ?? '—'}</td>
                      <td>{alternate?.surplusSeats ?? '—'}</td>
                      <td>{comparison.status === 'ok' ? alternate?.finalSeats : 'לא הוכרע'}</td>
                      <td className="num">{number(p.fractionMissing, 2)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {comparison.status !== 'ok' && (
          <p className="notice notice-warning">
            ההשוואה לא הוכרעה: {comparison.diagnostics.join(' ')}
          </p>
        )}
      </section>
      <SurplusDetails calc={calc} config={data.config} expanded />
      <section className="panel explanation">
        <h2>איך לקרוא את הפער?</h2>
        <p>
          מכסה גולמית של 29.80 פירושה שנצברו 0.80 מהמכסה הפשוטה הבאה, והפער הפשוט הוא 0.20. מנדט
          נוסף בפועל תלוי גם ביתר הרשימות, בסף ובהסכמי העודפים.
        </p>
        <p>
          בתוספת קולות לרשימה גדל גם סך הקולות הכשרים. לכן תרחיש התוספת מחשב את החלוקה מחדש, ולא
          מכפיל את הפער הפשוט במכסה קבועה.
        </p>
      </section>
    </div>
  );
}
