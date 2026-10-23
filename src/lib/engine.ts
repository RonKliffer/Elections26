import type {
  ElectionCalculation,
  ElectionConfig,
  ElectionSnapshot,
  NextSeatResult,
  PartyCalculation,
  QuotaMode,
  Rational,
  SnapshotChanges,
} from './types';

export const rational = (n: bigint | number, d: bigint | number = 1): Rational => ({
  numerator: String(n),
  denominator: String(d),
});
export const rationalNumber = (r: Rational): number => Number(r.numerator) / Number(r.denominator);
const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b;
const validCount = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

export function validateElectionInput(
  snapshot: ElectionSnapshot,
  config: ElectionConfig,
): string[] {
  const errors: string[] = [];
  if (snapshot.electionId !== config.electionId)
    errors.push('מזהה הבחירות במקור אינו תואם להגדרות.');
  if (!validCount(snapshot.validVotes) || snapshot.validVotes === 0)
    errors.push('אין עדיין מספר חיובי ותקין של קולות כשרים.');
  if (!Number.isInteger(config.totalSeats) || config.totalSeats < 1 || config.totalSeats > 1000)
    errors.push('מספר המושבים אינו תקין.');
  const { numerator, denominator } = config.electoralThreshold;
  if (
    !validCount(numerator) ||
    !validCount(denominator) ||
    numerator === 0 ||
    numerator >= denominator
  )
    errors.push('אחוז החסימה אינו תקין.');
  const ids = new Set<string>();
  const ballots = new Set<string>();
  for (const p of snapshot.parties) {
    if (!p.id || !p.ballot || !p.name || ids.has(p.id) || ballots.has(p.ballot))
      errors.push('מזהה רשימה חסר או כפול.');
    ids.add(p.id);
    ballots.add(p.ballot);
    if (!validCount(p.votes)) errors.push(`מספר קולות לא תקין לרשימה ${p.ballot}.`);
    if (
      p.officialSeats !== null &&
      (!validCount(p.officialSeats) || p.officialSeats > config.totalSeats)
    )
      errors.push(`מספר מנדטים רשמי לא תקין: ${p.ballot}.`);
  }
  if (!snapshot.parties.length) errors.push('רשימת המפלגות ריקה.');
  if (
    snapshot.parties.every((p) => validCount(p.votes)) &&
    snapshot.parties.reduce((n, p) => n + BigInt(p.votes), 0n) !==
      BigInt(validCount(snapshot.validVotes) ? snapshot.validVotes : 0)
  )
    errors.push('סכום קולות הרשימות אינו תואם לקולות הכשרים הארציים.');
  const paired = new Set<string>();
  for (const [a, b] of config.surplusAgreements) {
    if (a === b || paired.has(a) || paired.has(b) || !ids.has(a) || !ids.has(b))
      errors.push(`הסכם עודפים לא תקין או רשימה חסרה: ${a} / ${b}.`);
    paired.add(a);
    paired.add(b);
  }
  return errors;
}

interface Candidate {
  ids: string[];
  votes: bigint;
  seats: number;
}
function highest(candidates: Candidate[]): Candidate | null {
  let winner: Candidate | null = null;
  let tied = false;
  for (const c of candidates) {
    if (!winner || c.votes * BigInt(winner.seats + 1) > winner.votes * BigInt(c.seats + 1)) {
      winner = c;
      tied = false;
    } else if (c.votes * BigInt(winner.seats + 1) === winner.votes * BigInt(c.seats + 1))
      tied = true;
  }
  return tied ? null : winner;
}

// Section 82(b): repeat the allocation within the pair using its final seat
// total, including the integer quota in statutory mode. Never round indicators.
function allocatePair(
  votes: bigint[],
  seats: number,
  mode: QuotaMode,
): { seats: number[]; quota: Rational } | null {
  const total = votes.reduce((a, b) => a + b, 0n);
  const q = mode === 'statutory' ? total / BigInt(seats) : total;
  const denominator = mode === 'statutory' ? 1n : BigInt(seats);
  if (!q) return null;
  const allocated = votes.map((v) => Number((v * denominator) / q));
  if (allocated.reduce((a, b) => a + b, 0) > seats) return null;
  while (allocated.reduce((a, b) => a + b, 0) < seats) {
    const candidates = votes
      .map((v, i) => ({ ids: [String(i)], votes: v, seats: allocated[i]! }))
      .filter((c) => !(c.seats * 2 >= seats && c.votes * 2n <= total));
    const winner = highest(candidates);
    if (!winner) return null;
    const i = Number(winner.ids[0]);
    allocated[i] = allocated[i]! + 1;
  }
  return { seats: allocated, quota: rational(q, denominator) };
}

export function calculateElection(
  snapshot: ElectionSnapshot,
  config: ElectionConfig,
  mode: QuotaMode = 'statutory',
): ElectionCalculation {
  const result: ElectionCalculation = {
    status: 'invalid',
    mode,
    diagnostics: [],
    thresholdVotes: 0,
    qualifyingVotes: 0,
    wastedVotes: 0,
    wastedPercentage: 0,
    simpleQuota: null,
    statutoryQuota: 0,
    initialSeats: 0,
    surplusSeats: 0,
    totalSeats: 0,
    parties: [],
    agreements: [],
    rounds: [],
  };
  result.diagnostics = validateElectionInput(snapshot, config);
  if (result.diagnostics.length) return result;
  const total = BigInt(snapshot.validVotes);
  const t = config.electoralThreshold;
  result.thresholdVotes = Number(ceilDiv(total * BigInt(t.numerator), BigInt(t.denominator)));
  result.qualifyingVotes = snapshot.parties
    .filter((p) => p.votes >= result.thresholdVotes)
    .reduce((s, p) => s + p.votes, 0);
  result.wastedVotes = snapshot.validVotes - result.qualifyingVotes;
  result.wastedPercentage = (result.wastedVotes / snapshot.validVotes) * 100;
  if (!result.qualifyingVotes) {
    result.diagnostics.push('אין רשימות שעברו את אחוז החסימה.');
    return result;
  }
  const eligible = BigInt(result.qualifyingVotes);
  result.simpleQuota = rational(eligible, config.totalSeats);
  result.statutoryQuota = Number(eligible / BigInt(config.totalSeats));
  if (result.statutoryQuota === 0) {
    result.diagnostics.push('הספירה מוקדמת מדי: המודד השלם הוא אפס.');
    return result;
  }
  const partners = new Map<string, string>();
  config.surplusAgreements.forEach(([a, b]) => {
    partners.set(a, b);
    partners.set(b, a);
  });
  result.parties = snapshot.parties.map((p) => {
    const qualifies = p.votes >= result.thresholdVotes;
    const rawNumerator = BigInt(p.votes) * BigInt(config.totalSeats);
    const remainder = qualifies ? Number(rawNumerator % eligible) / result.qualifyingVotes : null;
    const initialSeats = qualifies
      ? Number(
          mode === 'statutory'
            ? BigInt(p.votes) / BigInt(result.statutoryQuota)
            : rawNumerator / eligible,
        )
      : 0;
    const qualificationNumerator =
      total * BigInt(t.numerator) - BigInt(p.votes) * BigInt(t.denominator);
    return {
      ...p,
      qualifies,
      percentage: (p.votes / snapshot.validVotes) * 100,
      thresholdMargin: p.votes - result.thresholdVotes,
      thresholdDistancePp:
        (p.votes / snapshot.validVotes) * 100 - (t.numerator / t.denominator) * 100,
      additionalToQualify:
        qualificationNumerator > 0n
          ? Number(ceilDiv(qualificationNumerator, BigInt(t.denominator - t.numerator)))
          : 0,
      rawSeatEquivalent: qualifies ? Number(rawNumerator) / result.qualifyingVotes : null,
      rawSeatExact: qualifies ? rational(rawNumerator, eligible) : null,
      fractionEarned: remainder,
      fractionMissing: remainder === null ? null : 1 - remainder,
      initialSeats,
      surplusSeats: 0,
      finalSeats: initialSeats,
      agreementPartner: partners.get(p.id) ?? null,
    };
  });
  const byId = new Map(result.parties.map((p) => [p.id, p]));
  result.initialSeats = result.parties.reduce((n, p) => n + p.initialSeats, 0);
  result.totalSeats = result.initialSeats;
  if (result.initialSeats > config.totalSeats) {
    result.diagnostics.push(
      'המודד השלם יוצר הקצאה ראשונית גדולה ממספר המושבים; אין חלוקה תקפה לספירה זו.',
    );
    return result;
  }
  const units: Candidate[] = [];
  const paired = new Set<string>();
  result.agreements = config.surplusAgreements.map(([a, b]) => {
    const pa = byId.get(a)!,
      pb = byId.get(b)!;
    const active = pa.qualifies && pb.qualifies;
    if (active) {
      units.push({
        ids: [a, b],
        votes: BigInt(pa.votes) + BigInt(pb.votes),
        seats: pa.initialSeats + pb.initialSeats,
      });
      paired.add(a);
      paired.add(b);
    }
    return {
      parties: [a, b],
      active,
      reason: active ? 'שתי הרשימות עברו את הסף' : 'לפחות אחת הרשימות מתחת לסף',
      votes: pa.votes + pb.votes,
      initialSeats: pa.initialSeats + pb.initialSeats,
      finalSeats: pa.initialSeats + pb.initialSeats,
      internalQuota: null,
    };
  });
  result.parties
    .filter((p) => p.qualifies && !paired.has(p.id))
    .forEach((p) => units.push({ ids: [p.id], votes: BigInt(p.votes), seats: p.initialSeats }));
  result.status = 'ok';
  while (result.totalSeats < config.totalSeats) {
    const candidates = units.filter(
      (u) => !(u.seats * 2 >= config.totalSeats && u.votes * 2n <= eligible),
    );
    const winner = highest(candidates);
    if (!winner) {
      result.status = 'unresolved';
      result.diagnostics.push('שוויון במדד המוביל או אין יחידה זכאית: נדרשת הכרעת ועדת הבחירות.');
      break;
    }
    const indicator = rational(winner.votes, winner.seats + 1);
    let recipient: PartyCalculation;
    if (winner.ids.length === 2) {
      const members = winner.ids.map((id) => byId.get(id)!);
      const allocation = allocatePair(
        members.map((p) => BigInt(p.votes)),
        winner.seats + 1,
        mode,
      );
      const changed = allocation
        ? members.filter((p, i) => allocation.seats[i] !== p.finalSeats)
        : [];
      if (
        !allocation ||
        changed.length !== 1 ||
        allocation.seats[members.indexOf(changed[0]!)] !== changed[0]!.finalSeats + 1
      ) {
        result.status = 'unresolved';
        result.diagnostics.push(
          'לא ניתן להכריע בחלוקה הפנימית של הסכם העודפים (שוויון או ספירה חריגה).',
        );
        break;
      }
      recipient = changed[0]!;
    } else recipient = byId.get(winner.ids[0]!)!;
    const recipientIndicator = rational(recipient.votes, recipient.finalSeats + 1);
    result.rounds.push({
      seat: result.totalSeats + 1,
      unit: [...winner.ids],
      recipient: recipient.id,
      indicator,
      recipientIndicator,
      candidates: candidates.map((c) => ({
        unit: [...c.ids],
        indicator: rational(c.votes, c.seats + 1),
      })),
    });
    winner.seats++;
    recipient.finalSeats++;
    recipient.surplusSeats++;
    result.totalSeats++;
    result.surplusSeats++;
  }
  for (const agreement of result.agreements) {
    const members = agreement.parties.map((id) => byId.get(id)!);
    agreement.finalSeats = members.reduce((s, p) => s + p.finalSeats, 0);
    if (agreement.active && agreement.finalSeats)
      agreement.internalQuota =
        allocatePair(
          members.map((p) => BigInt(p.votes)),
          agreement.finalSeats,
          mode,
        )?.quota ?? null;
  }
  return result;
}

export function publishedSeatWarnings(calculation: ElectionCalculation): string[] {
  if (calculation.status !== 'ok') return [];
  return calculation.parties
    .filter((p) => p.officialSeats !== null && p.officialSeats !== p.finalSeats)
    .map(
      (p) => `אי־התאמה לרשימה ${p.ballot}: החישוב ${p.finalSeats}, המקור הרשמי ${p.officialSeats}.`,
    );
}

/** A mathematical addition of votes, not a turnout or outstanding-ballot forecast. */
export function additionalVotesForNextSeat(
  snapshot: ElectionSnapshot,
  config: ElectionConfig,
  partyId: string,
  baseline = calculateElection(snapshot, config),
): NextSeatResult {
  const unavailable = (reason: string, evaluations = 0): NextSeatResult => ({
    status: 'unavailable',
    additionalVotes: null,
    targetSeats: null,
    reason,
    evaluations,
  });
  const party = baseline.parties.find((p) => p.id === partyId);
  if (baseline.status !== 'ok' || !party) return unavailable('אין חלוקת בסיס תקפה.');
  if (!party.qualifies)
    return {
      status: 'threshold',
      additionalVotes: party.additionalToQualify,
      targetSeats: null,
      reason: 'תוספת לחציית הסף, כולל הגדלת המכנה הארצי',
      evaluations: 0,
    };
  if (party.finalSeats >= config.totalSeats) return unavailable('כל המושבים כבר הוקצו לרשימה.');
  // At very low counts the statutory floor can produce unusual nonmonotonic
  // allocations. Keep the practical search restricted to election-sized counts.
  if (baseline.statutoryQuota < config.totalSeats)
    return unavailable('הספירה מוקדמת מדי לתרחיש מנדט נוסף יציב.');
  const target = party.finalSeats + 1;
  let evaluations = 0;
  const cache = new Map<number, number | null>();
  const boundaryTies = new Set<number>();
  const evaluate = (extra: number): number | null => {
    if (cache.has(extra)) return cache.get(extra)!;
    evaluations++;
    const simulated = calculateElection(
      {
        ...snapshot,
        validVotes: snapshot.validVotes + extra,
        parties: snapshot.parties.map((p) =>
          p.id === partyId ? { ...p, votes: p.votes + extra } : p,
        ),
      },
      config,
    );
    const count =
      simulated.status === 'ok'
        ? simulated.parties.find((p) => p.id === partyId)!.finalSeats
        : null;
    cache.set(extra, count);
    return count;
  };
  // A sampled exact tie need not invalidate the entire search. Adjacent valid
  // counts can establish the minimum definite gain without simulating a draw.
  const probe = (extra: number): number | null => {
    const value = evaluate(extra);
    if (value !== null) return value;
    const left = evaluate(Math.max(0, extra - 1)),
      right = evaluate(extra + 1);
    if (left === null || right === null || left > right) return null;
    if (left < target && right >= target) boundaryTies.add(extra);
    return left;
  };
  // This bound makes every other party fall below the moving threshold. The
  // target then has all seats. It also prevents unbounded/safe-integer overflow.
  const { numerator, denominator } = config.electoralThreshold;
  const maxOther = Math.max(
    0,
    ...snapshot.parties.filter((p) => p.id !== partyId).map((p) => p.votes),
  );
  const bound = Math.max(
    1,
    Number((BigInt(maxOther) * BigInt(denominator)) / BigInt(numerator)) - snapshot.validVotes + 1,
    config.totalSeats ** 2 - party.votes,
  );
  if (!Number.isSafeInteger(snapshot.validVotes + bound))
    return unavailable('התרחיש חורג מטווח המספרים הבטוח.');
  let low = 0,
    high = 1;
  while (high <= bound) {
    const count = probe(high);
    if (count === null)
      return unavailable('שוויון או חלוקה לא תקפה בתרחיש; לא מוצג אומדן שרירותי.', evaluations);
    if (count >= target) break;
    low = high;
    if (high === bound) return unavailable('לא נמצא פתרון בתחום החיפוש.', evaluations);
    high = Math.min(high * 2, bound);
  }
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2),
      count = probe(mid);
    if (count === null) return unavailable('שוויון או חלוקה לא תקפה במהלך החיפוש.', evaluations);
    if (count >= target) high = mid;
    else low = mid;
  }
  const before = probe(high - 1),
    at = evaluate(high),
    after = evaluate(high + 1);
  if (
    before === null ||
    at === null ||
    after === null ||
    before >= target ||
    at < target ||
    after < target
  )
    return unavailable('לא ניתן לאמת גבול חד־משמעי בתרחיש זה.', evaluations);
  const tieAtVotes = boundaryTies.has(high - 1) ? high - 1 : undefined;
  return {
    status: 'ok',
    additionalVotes: high,
    targetSeats: target,
    reason:
      tieAtVotes === undefined
        ? null
        : `ב־${tieAtVotes} קולות נדרשת הכרעה. מוצגת התוספת המזערית שמעניקה מנדט ללא הכרעה זו.`,
    evaluations,
    ...(tieAtVotes === undefined ? {} : { tieAtVotes }),
  };
}

export function compareSnapshots(
  previous: ElectionSnapshot,
  current: ElectionSnapshot,
  config: ElectionConfig,
): SnapshotChanges {
  const before = calculateElection(previous, config),
    after = calculateElection(current, config);
  const changes: SnapshotChanges = {
    fromRetrievedAt: previous.retrievedAt,
    parties: {},
    agreementChanges: [],
  };
  for (const p of current.parties) {
    const old = previous.parties.find((o) => o.id === p.id);
    const a = after.parties.find((o) => o.id === p.id),
      b = before.parties.find((o) => o.id === p.id);
    changes.parties[p.id] = {
      votes: p.votes - (old?.votes ?? 0),
      initialSeats:
        before.status === 'ok' && after.status === 'ok'
          ? a!.initialSeats - (b?.initialSeats ?? 0)
          : null,
      finalSeats:
        before.status === 'ok' && after.status === 'ok'
          ? a!.finalSeats - (b?.finalSeats ?? 0)
          : null,
      crossing: a && b && a.qualifies !== b.qualifies ? (a.qualifies ? 'above' : 'below') : null,
    };
  }
  if (before.status === 'ok' && after.status === 'ok')
    after.agreements.forEach((a) => {
      const old = before.agreements.find((b) => b.parties.join('|') === a.parties.join('|'));
      if (old && old.active !== a.active)
        changes.agreementChanges.push(
          `${a.parties.join(' / ')}: ${a.active ? 'הופעל' : 'אינו פעיל'}`,
        );
    });
  return changes;
}
