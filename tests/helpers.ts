import official from '../fixtures/2022/official.json';
import workbook from '../fixtures/2022/workbook-snapshot.json';
import { electionConfig } from '../src/config/election';
import type { ElectionConfig, ElectionSnapshot } from '../src/lib/types';
export const config = structuredClone(electionConfig);
export const final2022 = official as ElectionSnapshot;
export const workbook2022 = workbook as ElectionSnapshot;
export function synthetic(
  votes: number[],
  seats = 120,
  pairs: [string, string][] = [],
): { snapshot: ElectionSnapshot; config: ElectionConfig } {
  const snapshot: ElectionSnapshot = {
    electionId: 'test',
    electionName: 'Test',
    mode: 'demo',
    status: 'provisional',
    sourceUrl: 'https://example.com',
    validVotes: votes.reduce((a, b) => a + b, 0),
    invalidVotes: 0,
    votesCast: votes.reduce((a, b) => a + b, 0),
    eligibleVoters: 10_000_000,
    officialUpdatedAt: null,
    retrievedAt: '2026-10-23T10:00:00.000Z',
    reportingProgress: null,
    warnings: [],
    parties: votes.map((v, i) => ({
      id: String(i),
      ballot: String(i),
      name: `Party ${i}`,
      votes: v,
      officialSeats: null,
    })),
  };
  return {
    snapshot,
    config: {
      ...config,
      electionId: 'test',
      expectedBallots: [],
      surplusAgreements: pairs,
      totalSeats: seats,
    },
  };
}
export function addVotes(snapshot: ElectionSnapshot, id: string, extra: number): ElectionSnapshot {
  return {
    ...snapshot,
    validVotes: snapshot.validVotes + extra,
    votesCast: snapshot.votesCast === null ? null : snapshot.votesCast + extra,
    parties: snapshot.parties.map((p) => (p.id === id ? { ...p, votes: p.votes + extra } : p)),
  };
}
