import { describe, expect, it } from 'vitest';
import snapshot from '../fixtures/2026/surplus-regression.json';
import { electionConfig } from '../src/config/election';
import { calculateElection } from '../src/lib/engine';
import type { ElectionCalculation, ElectionSnapshot } from '../src/lib/types';

const coalitionSeats = (result: ElectionCalculation) =>
  result.parties
    .filter((p) => electionConfig.coalitions[0]!.right.includes(p.id))
    .reduce((sum, p) => sum + p.finalSeats, 0);

describe('2026 surplus agreement regression (28 October, 07:57 Israel time)', () => {
  it.each(['statutory', 'unrounded'] as const)(
    'allocates all 120 seats with 55 for the current coalition in %s mode',
    (mode) => {
      const result = calculateElection(snapshot as ElectionSnapshot, electionConfig, mode);
      expect(result.status).toBe('ok');
      expect(result.totalSeats).toBe(120);
      expect(result.parties.reduce((sum, p) => sum + p.finalSeats, 0)).toBe(120);
      expect(coalitionSeats(result)).toBe(55);
      expect(
        Object.fromEntries(
          result.parties.filter((p) => p.qualifies).map((p) => [p.id, p.finalSeats]),
        ),
      ).toEqual({
        מחל: 27,
        דרך: 21,
        רק: 11,
        ודם: 12,
        אמת: 9,
        ג: 9,
        ל: 8,
        שס: 7,
        ב: 6,
        ט: 6,
        עם: 4,
      });
      expect(result.rounds.map((round) => round.recipient)).toEqual([
        'ל',
        'אמת',
        'ג',
        'ודם',
        'מחל',
      ]);
      expect(result.agreements.find((a) => a.parties.includes('עם'))).toMatchObject({
        active: true,
        finalSeats: 16,
      });
    },
  );

  it('reproduces the erroneous 56 on the same votes when the Arab surplus agreement is omitted', () => {
    const configWithoutAgreement = {
      ...electionConfig,
      surplusAgreements: electionConfig.surplusAgreements.filter((pair) => !pair.includes('עם')),
    };
    const result = calculateElection(snapshot as ElectionSnapshot, configWithoutAgreement);
    expect(result.status).toBe('ok');
    expect(coalitionSeats(result)).toBe(56);
    expect(result.parties.find((p) => p.id === 'ב')!.finalSeats).toBe(7);
    expect(result.parties.find((p) => p.id === 'ודם')!.finalSeats).toBe(11);
  });
});
