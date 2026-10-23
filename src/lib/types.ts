export interface Rational {
  numerator: string;
  denominator: string;
}
export interface PartyVotes {
  id: string;
  ballot: string;
  name: string;
  votes: number;
  officialSeats: number | null;
}
export interface ElectionSnapshot {
  electionId: string;
  electionName: string;
  sourceUrl: string;
  status: 'unknown' | 'provisional' | 'final';
  mode: 'official' | 'demo';
  validVotes: number;
  invalidVotes: number | null;
  votesCast: number | null;
  eligibleVoters: number | null;
  officialUpdatedAt: string | null;
  retrievedAt: string;
  reportingProgress: number | null;
  parties: PartyVotes[];
  warnings: string[];
}
export interface ElectionConfig {
  electionId: string;
  electionName: string;
  sourceUrl: string;
  testing: boolean;
  electoralThreshold: { numerator: number; denominator: number };
  totalSeats: number;
  surplusAgreements: [string, string][];
  parties: Record<string, { label: string; color: string }>;
  expectedBallots: string[];
  blocs: { name: string; partyIds: string[] }[];
  thresholdWatchDistance: number;
}
export type QuotaMode = 'statutory' | 'unrounded';
export interface PartyCalculation extends PartyVotes {
  qualifies: boolean;
  percentage: number;
  thresholdMargin: number;
  thresholdDistancePp: number;
  additionalToQualify: number;
  rawSeatEquivalent: number | null;
  rawSeatExact: Rational | null;
  fractionEarned: number | null;
  fractionMissing: number | null;
  initialSeats: number;
  surplusSeats: number;
  finalSeats: number;
  agreementPartner: string | null;
}
export interface AgreementCalculation {
  parties: [string, string];
  active: boolean;
  reason: string;
  votes: number;
  initialSeats: number;
  finalSeats: number;
  internalQuota: Rational | null;
}
export interface AllocationRound {
  seat: number;
  unit: string[];
  recipient: string;
  indicator: Rational;
  recipientIndicator: Rational;
  candidates: { unit: string[]; indicator: Rational }[];
}
export interface ElectionCalculation {
  status: 'ok' | 'invalid' | 'unresolved';
  mode: QuotaMode;
  diagnostics: string[];
  thresholdVotes: number;
  qualifyingVotes: number;
  wastedVotes: number;
  wastedPercentage: number;
  simpleQuota: Rational | null;
  statutoryQuota: number;
  initialSeats: number;
  surplusSeats: number;
  totalSeats: number;
  parties: PartyCalculation[];
  agreements: AgreementCalculation[];
  rounds: AllocationRound[];
}
export interface NextSeatResult {
  status: 'ok' | 'threshold' | 'unavailable';
  additionalVotes: number | null;
  targetSeats: number | null;
  reason: string | null;
  evaluations: number;
  tieAtVotes?: number;
}
export interface SnapshotChanges {
  fromRetrievedAt: string;
  parties: Record<
    string,
    {
      votes: number;
      initialSeats: number | null;
      finalSeats: number | null;
      crossing: 'above' | 'below' | null;
    }
  >;
  agreementChanges: string[];
}
export interface DashboardState {
  config: ElectionConfig;
  connection: 'loading' | 'fresh' | 'stale' | 'error';
  error: string | null;
  refreshing: boolean;
  lastAttemptAt: string | null;
  nextRefreshAt: string | null;
  snapshot: ElectionSnapshot | null;
  calculation: ElectionCalculation | null;
  comparison: ElectionCalculation | null;
  nextSeats: Record<string, NextSeatResult>;
  changes: SnapshotChanges | null;
  previousSeats: Record<string, number> | null;
}
