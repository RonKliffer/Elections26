'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DashboardState,
  ElectionCalculation,
  ElectionConfig,
  PartyCalculation,
  Rational,
} from '@/lib/types';
import { partyColor, partyLabel } from '@/config/election';
import { fraction, fullTime, number, signed, time } from '@/lib/format';
import { publishedSeatWarnings } from '@/lib/engine';

function Info({ text }: { text: string }) {
  return (
    <span className="info" tabIndex={0} role="note" aria-label={text}>
      ?
      <span className="tooltip" role="tooltip">
        {text}
      </span>
    </span>
  );
}
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
            <section className="metrics-grid" aria-label="נתונים ארציים">
              <Metric
                label="קולות כשרים"
                value={number(snapshot.validVotes)}
                sub={`${number(snapshot.votesCast)} קולות שהצביעו בפועל`}
                extraSub={`${number(snapshot.invalidVotes)} קולות פסולים`}
              />
              <Metric
                label="שיעור הצבעה"
                value={
                  snapshot.votesCast !== null && snapshot.eligibleVoters
                    ? `${number((snapshot.votesCast / snapshot.eligibleVoters) * 100, 2)}%`
                    : '—'
                }
                sub={`${number(snapshot.eligibleVoters)} בעלי זכות בחירה`}
                extraSub={`${snapshot.eligibleVoters ? `${number((snapshot.validVotes / snapshot.eligibleVoters) * 100, 2)}%` : '—'} שיעור הצבעה כשרה`}
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
                <div className="overview-grid">
                  <SeatChart calc={calc} config={data!.config} />
                  <Coalition data={data!} />
                </div>
                <ThresholdWatch calc={calc} data={data!} />
                <PartyTable data={data!} />
                {!!data!.changes?.agreementChanges.length && (
                  <div className="notice notice-warning" role="status">
                    שינוי בהסכמי העודפים לעומת השליפה הקודמת:{' '}
                    {data!.changes.agreementChanges.join('; ')}
                  </div>
                )}
                <SurplusDetails calc={calc} config={data!.config} />
              </>
            ) : (
              <ExactView data={data!} />
            )}
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

function SeatChart({ calc, config }: { calc: ElectionCalculation; config: ElectionConfig }) {
  const parties = calc.parties
    .filter((p) => p.finalSeats)
    .sort((a, b) => b.finalSeats - a.finalSeats);
  return (
    <section className="panel seat-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">החלוקה המחושבת</div>
          <h2>תמונת המנדטים</h2>
        </div>
        <div className="seats-total">
          <strong className="num">{calc.totalSeats}</strong>
          <span>/ {config.totalSeats} מושבים</span>
        </div>
      </div>
      <div
        className="seat-bar"
        role="img"
        aria-label={parties.map((p) => `${partyLabel(p.id, config)}: ${p.finalSeats}`).join(', ')}
      >
        {parties.map((p) => (
          <div
            key={p.id}
            style={{
              flexBasis: `${(p.finalSeats / config.totalSeats) * 100}%`,
              background: partyColor(p.id, config),
            }}
            title={`${partyLabel(p.id, config)}: ${p.finalSeats}`}
          >
            <span className="num">{p.finalSeats}</span>
          </div>
        ))}
      </div>
      <div className="majority-guide">
        <span>0</span>
        <span>{Math.floor(config.totalSeats / 2) + 1} לרוב בכנסת</span>
        <span>{config.totalSeats}</span>
      </div>
      <div className="seat-legend">
        {parties.map((p) => (
          <div key={p.id}>
            <PartyName party={p} config={config} />
            <strong className="num">{p.finalSeats}</strong>
          </div>
        ))}
      </div>
      <div className="seat-foot">
        <span>
          <strong className="num">{calc.initialSeats}</strong> בהקצאה ראשונית
        </span>
        <span>
          <strong className="num">{calc.surplusSeats}</strong> בשלב העודפים
        </span>
        <span className={calc.status === 'ok' ? 'positive-text' : 'warning-text'}>
          {calc.status === 'ok' ? 'כל המושבים חולקו' : 'חלוקה לא הושלמה'}
        </span>
      </div>
    </section>
  );
}

interface SavedCoalition {
  name: string;
  ids: string[];
}
function Coalition({ data }: { data: DashboardState }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedCoalition[]>([]);
  const [name, setName] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const key = `knesset-coalitions-${data.config.electionId}`;
  const parties = data
    .calculation!.parties.filter((p) => p.qualifies)
    .sort((a, b) => b.finalSeats - a.finalSeats);
  const ids = data.snapshot!.parties.map((p) => p.id);
  const roster = [...ids].sort().join('|');
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? 'null') as {
        roster?: string;
        selected?: unknown;
        saved?: unknown;
      } | null;
      if (value?.roster === roster) {
        if (Array.isArray(value.selected))
          setSelected(
            value.selected.filter((id): id is string => typeof id === 'string' && ids.includes(id)),
          );
        if (Array.isArray(value.saved))
          setSaved(
            value.saved.filter(
              (item): item is SavedCoalition =>
                typeof item?.name === 'string' &&
                Array.isArray(item.ids) &&
                item.ids.every((id: unknown) => typeof id === 'string' && ids.includes(id)),
            ),
          );
      }
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
        localStorage.setItem(key, JSON.stringify({ roster, selected, saved }));
      } catch {
        /* Browser storage may be disabled. */
      }
    }
  }, [key, roster, selected, saved, hydrated]);
  const seats = parties
    .filter((p) => selected.includes(p.id))
    .reduce((n, p) => n + p.finalSeats, 0);
  const before = data.previousSeats
    ? selected.reduce((n, id) => n + (data.previousSeats![id] ?? 0), 0)
    : null;
  const majority = Math.floor(data.config.totalSeats / 2) + 1;
  const valid = data.calculation!.status === 'ok';
  const save = () => {
    if (!name.trim()) return;
    setSaved((old) => [
      ...old.filter((s) => s.name !== name.trim()),
      { name: name.trim(), ids: selected },
    ]);
    setName('');
  };
  return (
    <section className="panel coalition-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">ההרכב שלכם</div>
          <h2>מחשבון קואליציה</h2>
        </div>
        <button className="text-button" onClick={() => setSelected([])}>
          ניקוי
        </button>
      </div>
      <div className="coalition-score">
        <strong className="num">{valid ? seats : '—'}</strong>
        <div>
          {!valid
            ? 'אין חלוקה מלאה'
            : seats >= majority
              ? 'הבחירה מגיעה לרוב'
              : `עוד ${number(majority - seats)} מנדטים לרוב`}
          {before !== null && valid && (
            <small>
              שינוי מהשליפה הקודמת: <bdi>{signed(seats - before)}</bdi>
            </small>
          )}
        </div>
      </div>
      <div className="coalition-progress">
        <div
          style={{
            width: `${Math.min((seats / majority) * 100, 100)}%`,
            background: seats >= majority ? '#347d69' : '#496c9f',
          }}
        />
      </div>
      <div className="coalition-options">
        {parties.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              checked={selected.includes(p.id)}
              onChange={() =>
                setSelected((old) =>
                  old.includes(p.id) ? old.filter((id) => id !== p.id) : [...old, p.id],
                )
              }
              disabled={!valid}
            />
            <PartyName party={p} config={data.config} />
            <bdi className="num">{p.finalSeats}</bdi>
          </label>
        ))}
      </div>
      <form
        className="coalition-save"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          aria-label="שם להרכב"
          placeholder="שם להרכב לשמירה"
          value={name}
          maxLength={50}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>
          שמירה
        </button>
      </form>
      {saved.length > 0 && (
        <div className="saved-coalitions">
          {saved.map((s) => (
            <span key={s.name}>
              <button onClick={() => setSelected(s.ids)}>{s.name}</button>
              <button
                aria-label={`מחיקת הרכב ${s.name}`}
                onClick={() => setSaved((old) => old.filter((item) => item.name !== s.name))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {data.config.blocs.length > 0 && (
        <div className="saved-coalitions">
          {data.config.blocs.map((b) => (
            <button key={b.name} onClick={() => setSelected(b.partyIds)}>
              {b.name}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ThresholdWatch({ calc, data }: { calc: ElectionCalculation; data: DashboardState }) {
  const parties = calc.parties
    .filter((p) => Math.abs(p.thresholdDistancePp) <= data.config.thresholdWatchDistance)
    .sort((a, b) => b.votes - a.votes);
  return (
    <section className="panel threshold-panel">
      <div className="panel-heading">
        <h2>
          על קו החסימה{' '}
          <Info text="המרחק מתייחס לסף הנוכחי. לפני תום הספירה אין הבטחה שרשימה תישאר מעליו." />
        </h2>
        <span className="muted">עד {data.config.thresholdWatchDistance} נקודת אחוז מהסף</span>
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
                <span className={p.qualifies ? 'positive-text' : 'warning-text'}>
                  <bdi className="num">{signed(p.thresholdMargin)}</bdi> קולות מהסף
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
      </div>
      <div className="table-scroll">
        <table className="results-table">
          <caption className="sr-only">תוצאות הרשימות וחלוקת המנדטים העצמאית</caption>
          <thead>
            <tr>
              <th scope="col">רשימה</th>
              <th scope="col">פתק</th>
              <th
                scope="col"
                aria-sort={sort === 'votes' ? (descending ? 'descending' : 'ascending') : 'none'}
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
                aria-sort={sort === 'seats' ? (descending ? 'descending' : 'ascending') : 'none'}
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
                          {next.status === 'threshold' ? 'לחציית הסף' : `למנדט ${next.targetSeats}`}
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
