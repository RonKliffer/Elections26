import { describe, expect, it } from 'vitest';
import {
  additionalVotesForNextSeat,
  calculateElection,
  compareSnapshots,
  publishedSeatWarnings,
} from '../src/lib/engine';
import { addVotes, config, final2022, synthetic, workbook2022 } from './helpers';

describe('2022 acceptance', () => {
  it('matches all official final seats, initial seats, totals, agreements, and surplus order', () => {
    const r = calculateElection(final2022, config);
    expect(r.status).toBe('ok');
    expect(r.thresholdVotes).toBe(154855);
    expect(r.qualifyingVotes).toBe(4347342);
    expect(r.wastedVotes).toBe(417400);
    expect(r.statutoryQuota).toBe(36227);
    expect(r.simpleQuota).toEqual({ numerator: '4347342', denominator: '120' });
    expect([r.initialSeats, r.surplusSeats, r.totalSeats]).toEqual([113, 7, 120]);
    const expected = {
      מחל: [30, 2, 32],
      פה: [23, 1, 24],
      ט: [14, 0, 14],
      כן: [11, 1, 12],
      שס: [10, 1, 11],
      ג: [7, 0, 7],
      ל: [5, 1, 6],
      עם: [5, 0, 5],
      ום: [4, 1, 5],
      אמת: [4, 0, 4],
    };
    for (const p of r.parties)
      expect([p.initialSeats, p.surplusSeats, p.finalSeats]).toEqual(
        expected[p.id as keyof typeof expected] ?? [0, 0, 0],
      );
    expect(r.rounds.map((x) => x.recipient)).toEqual(['שס', 'כן', 'מחל', 'ום', 'ל', 'פה', 'מחל']);
    expect(r.rounds.map((x) => x.seat)).toEqual([114, 115, 116, 117, 118, 119, 120]);
    expect(r.rounds[0]!.indicator).toEqual({ numerator: '673158', denominator: '18' });
    expect(r.agreements.map((a) => a.active)).toEqual([true, true, true, false]);
    expect(publishedSeatWarnings(r)).toEqual([]);
  });
  it('validates the separate workbook intermediate snapshot', () => {
    const r = calculateElection(workbook2022, config);
    expect(workbook2022.validVotes).toBe(4763694);
    expect(r.status).toBe('ok');
    expect(r.thresholdVotes).toBe(154821);
    expect(r.statutoryQuota).toBe(36213);
    expect(r.totalSeats).toBe(120);
    expect(r.parties.map((p) => [p.id, p.finalSeats]).sort()).toEqual(
      calculateElection(final2022, config)
        .parties.map((p) => [p.id, p.finalSeats])
        .sort(),
    );
    expect(r.agreements[3]!.active).toBe(false);
  });
  it('keeps the exact-quota comparison distinct and reproduces 2022', () => {
    const r = calculateElection(final2022, config, 'unrounded');
    expect(r.totalSeats).toBe(120);
    expect(r.status).toBe('ok');
    expect(r.parties.map((p) => p.finalSeats)).toEqual(
      calculateElection(final2022, config).parties.map((p) => p.finalSeats),
    );
  });
});

describe('thresholds and fractional metrics', () => {
  it.each([3249, 3250, 3251])('handles exact 3.25%% boundary with %i votes', (votes) => {
    const { snapshot, config: c } = synthetic([votes, 100000 - votes]);
    const r = calculateElection(snapshot, c);
    const p = r.parties[0]!;
    expect(r.thresholdVotes).toBe(3250);
    expect(p.qualifies).toBe(votes >= 3250);
    expect(p.thresholdMargin).toBe(votes - 3250);
  });
  it('rounds a fractional threshold upward and includes below-threshold votes', () => {
    const { snapshot, config: c } = synthetic([3250, 96751]);
    const r = calculateElection(snapshot, c);
    expect(r.thresholdVotes).toBe(3251);
    expect(r.parties[0]!.qualifies).toBe(false);
  });
  it('uses the unrounded simple quota for raw equivalents and missing fraction', () => {
    const r = calculateElection(final2022, config),
      p = r.parties[0]!;
    expect(p.rawSeatEquivalent).toBeCloseTo((p.votes * 120) / 4347342, 10);
    expect(p.fractionMissing).toBeCloseTo(1 - ((p.votes * 120) % 4347342) / 4347342, 10);
    expect(r.parties.find((p) => p.id === 'מרצ')!.rawSeatEquivalent).toBeNull();
  });
  it('returns 1.00 missing at a whole simple quota', () => {
    const { snapshot, config: c } = synthetic([600000, 400000]);
    const p = calculateElection(snapshot, c).parties[0]!;
    expect(p.rawSeatEquivalent).toBe(72);
    expect(p.fractionEarned).toBe(0);
    expect(p.fractionMissing).toBe(1);
  });
  it('distinguishes the static threshold gap from addition with a growing denominator', () => {
    const r = calculateElection(final2022, config),
      meretz = r.parties.find((p) => p.id === 'מרצ')!;
    expect(meretz.thresholdMargin).toBe(-4062);
    expect(meretz.additionalToQualify).toBe(4198);
    expect(
      calculateElection(addVotes(final2022, 'מרצ', 4197), config).parties.find(
        (p) => p.id === 'מרצ',
      )!.qualifies,
    ).toBe(false);
    expect(
      calculateElection(addVotes(final2022, 'מרצ', 4198), config).parties.find(
        (p) => p.id === 'מרצ',
      )!.qualifies,
    ).toBe(true);
  });
});

describe('agreements and precision', () => {
  it.each([1000, 5000, 25000, 100000])(
    'recalculates the entire allocation after realistic additions of %i votes',
    (extra) => {
      for (const party of final2022.parties) {
        const r = calculateElection(addVotes(final2022, party.id, extra), config);
        expect(r.status, `${party.id}: ${r.diagnostics.join(' ')}`).toBe('ok');
        expect(r.totalSeats).toBe(120);
        expect(r.parties.reduce((n, p) => n + p.finalSeats, 0)).toBe(120);
        expect(r.initialSeats + r.surplusSeats).toBe(120);
        expect(r.parties.every((p) => p.qualifies || p.finalSeats === 0)).toBe(true);
      }
    },
  );
  it('combines only qualifying partners and includes independent parties', () => {
    const { snapshot, config: c } = synthetic([400001, 260003, 230007, 109989], 120, [['0', '1']]);
    const r = calculateElection(snapshot, c);
    expect(r.status).toBe('ok');
    expect(r.totalSeats).toBe(120);
    expect(r.agreements[0]!.active).toBe(true);
    expect(r.parties[2]!.finalSeats).toBeGreaterThan(0);
    expect(r.parties[3]!.finalSeats).toBeGreaterThan(0);
  });
  it('does not combine an ineligible partner', () => {
    const { snapshot, config: c } = synthetic([500003, 20001, 479996], 120, [['0', '1']]);
    const r = calculateElection(snapshot, c);
    expect(r.agreements[0]!.active).toBe(false);
    expect(r.parties[1]!.finalSeats).toBe(0);
  });
  it('does not settle exact highest-average ties by row order', () => {
    const { snapshot, config: c } = synthetic([400000, 400000, 400000], 5);
    expect(calculateElection(snapshot, c).status).toBe('unresolved');
    expect(
      calculateElection({ ...snapshot, parties: [...snapshot.parties].reverse() }, c).status,
    ).toBe('unresolved');
  });
  it('handles vote products beyond safe floating-point integer precision', () => {
    const r = calculateElection(
      {
        ...final2022,
        validVotes: final2022.validVotes * 1000000,
        parties: final2022.parties.map((p) => ({ ...p, votes: p.votes * 1000000 })),
      },
      config,
    );
    expect(r.status).toBe('ok');
    expect(r.parties.map((p) => p.finalSeats)).toEqual(
      calculateElection(final2022, config).parties.map((p) => p.finalSeats),
    );
  });
  it('respects the minority-vote majority restriction', () => {
    const { snapshot, config: c } = synthetic([490001, 300001, 209998]);
    const r = calculateElection(snapshot, c);
    expect(r.status).toBe('ok');
    expect(r.parties[0]!.finalSeats).toBeLessThanOrEqual(60);
  });
  it('reacts to updated votes and activates Labor–Meretz after a threshold crossing', () => {
    const r = calculateElection(addVotes(final2022, 'מרצ', 10000), config);
    expect(r.status).toBe('ok');
    expect(r.agreements[3]!.active).toBe(true);
    expect(r.totalSeats).toBe(120);
    expect(r.parties.find((p) => p.id === 'מרצ')!.finalSeats).toBeGreaterThan(0);
  });
  it('supports changed election identity, parties, threshold, and agreements', () => {
    const { snapshot, config: c } = synthetic([450001, 320003, 229996], 100, [['1', '2']]);
    c.electoralThreshold = { numerator: 1, denominator: 20 };
    const r = calculateElection(snapshot, c);
    expect(r.status).toBe('ok');
    expect(r.totalSeats).toBe(100);
    expect(r.thresholdVotes).toBe(50000);
  });
});

describe('next final seat counterfactuals', () => {
  const base = calculateElection(final2022, config);
  it('separately identifies the Shas boundary draw and minimum definite gain', () => {
    expect(additionalVotesForNextSeat(final2022, config, 'שס')).toMatchObject({
      status: 'ok',
      additionalVotes: 27328,
      tieAtVotes: 27327,
      targetSeats: 12,
    });
  });
  it.each(base.parties.filter((p) => p.qualifies).map((p) => p.id))(
    'verifies the adjacent count for %s',
    (id) => {
      const next = additionalVotesForNextSeat(final2022, config, id, base);
      expect(next.status, next.reason ?? '').toBe('ok');
      const n = next.additionalVotes!;
      const baseline = base.parties.find((p) => p.id === id)!;
      const before = calculateElection(addVotes(final2022, id, n - 1), config);
      if (next.tieAtVotes !== undefined) {
        expect(before.status).toBe('unresolved');
        expect(next.tieAtVotes).toBe(n - 1);
      } else
        expect(before.parties.find((p) => p.id === id)!.finalSeats).toBeLessThan(
          baseline.finalSeats + 1,
        );
      expect(
        calculateElection(addVotes(final2022, id, n), config).parties.find((p) => p.id === id)!
          .finalSeats,
      ).toBeGreaterThanOrEqual(baseline.finalSeats + 1);
      expect(next.evaluations).toBeLessThan(60);
    },
  );
  it('targets one more final seat rather than one more initial seat', () => {
    const next = additionalVotesForNextSeat(final2022, config, 'מחל');
    expect(next.targetSeats).toBe(33);
    expect(next.additionalVotes).toBeGreaterThan(10000);
  });
  it('cross-checks an efficient search with bounded brute force', () => {
    const snapshot = addVotes(
      final2022,
      'ל',
      additionalVotesForNextSeat(final2022, config, 'ל').additionalVotes! - 80,
    );
    const current = calculateElection(snapshot, config).parties.find(
      (p) => p.id === 'ל',
    )!.finalSeats;
    const brute = Array.from({ length: 120 }, (_, i) => i + 1).find(
      (n) =>
        calculateElection(addVotes(snapshot, 'ל', n), config).parties.find((p) => p.id === 'ל')!
          .finalSeats > current,
    );
    expect(additionalVotesForNextSeat(snapshot, config, 'ל').additionalVotes).toBe(brute);
  });
  it('returns threshold scenarios below the threshold', () => {
    expect(additionalVotesForNextSeat(final2022, config, 'מרצ')).toMatchObject({
      status: 'threshold',
      additionalVotes: 4198,
    });
  });
  it('returns a diagnostic for very early small-count cases', () => {
    const { snapshot, config: c } = synthetic([1073, 1148, 883, 390, 584]);
    expect(additionalVotesForNextSeat(snapshot, c, '0').status).toBe('unavailable');
  });
  it('handles a party already holding all seats', () => {
    const { snapshot, config: c } = synthetic([500000]);
    expect(additionalVotesForNextSeat(snapshot, c, '0').status).toBe('unavailable');
  });
});

describe('invalid inputs and changes', () => {
  it.each([0, -1, NaN, 1.5, Infinity])('rejects invalid valid-vote total %s', (n) =>
    expect(calculateElection({ ...final2022, validVotes: n }, config).status).toBe('invalid'),
  );
  it('rejects missing and duplicated parties', () => {
    expect(calculateElection({ ...final2022, parties: [] }, config).status).toBe('invalid');
    expect(
      calculateElection(
        { ...final2022, parties: [...final2022.parties, final2022.parties[0]!] },
        config,
      ).status,
    ).toBe('invalid');
  });
  it('rejects noninteger party votes and overlapping agreements', () => {
    expect(
      calculateElection(
        {
          ...final2022,
          parties: final2022.parties.map((p, i) => (i === 0 ? { ...p, votes: 1.2 } : p)),
        },
        config,
      ).status,
    ).toBe('invalid');
    expect(
      calculateElection(final2022, {
        ...config,
        surplusAgreements: [
          ['מחל', 'ט'],
          ['מחל', 'פה'],
        ],
      }).status,
    ).toBe('invalid');
  });
  it('surfaces official-seat disagreements without overwriting calculated seats', () => {
    const r = calculateElection(
      {
        ...final2022,
        parties: final2022.parties.map((p) => (p.id === 'מחל' ? { ...p, officialSeats: 31 } : p)),
      },
      config,
    );
    expect(r.parties[0]!.finalSeats).toBe(32);
    expect(publishedSeatWarnings(r)).toHaveLength(1);
  });
  it('tracks votes, seats, threshold crossings, and active agreements', () => {
    const next = addVotes(final2022, 'מרצ', 10000);
    const changes = compareSnapshots(final2022, next, config);
    expect(changes.parties['מרצ']).toMatchObject({ votes: 10000, crossing: 'above' });
    expect(changes.agreementChanges).toHaveLength(1);
  });
  it('is independent of party row order', () => {
    expect(
      calculateElection(
        { ...final2022, parties: [...final2022.parties].reverse() },
        config,
      ).rounds.map((r) => r.recipient),
    ).toEqual(calculateElection(final2022, config).rounds.map((r) => r.recipient));
  });
});
