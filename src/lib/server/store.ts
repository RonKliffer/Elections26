import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ElectionConfig, ElectionSnapshot } from '../types';

export function snapshotFingerprint(s: ElectionSnapshot): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        electionId: s.electionId,
        status: s.status,
        validVotes: s.validVotes,
        invalidVotes: s.invalidVotes,
        votesCast: s.votesCast,
        eligibleVoters: s.eligibleVoters,
        officialUpdatedAt: s.officialUpdatedAt,
        reportingProgress: s.reportingProgress,
        parties: [...s.parties].sort((a, b) => a.id.localeCompare(b.id)),
        warnings: s.warnings,
      }),
    )
    .digest('hex');
}
export interface StoredSnapshots {
  current: ElectionSnapshot;
  previous: ElectionSnapshot | null;
}
export interface SnapshotStore {
  load(): Promise<StoredSnapshots | null>;
  save(data: StoredSnapshots): Promise<void>;
}
export class FileSnapshotStore implements SnapshotStore {
  readonly file: string;
  constructor(config: ElectionConfig, directory: string, mode: string) {
    const namespace = createHash('sha256')
      .update(JSON.stringify({ version: 1, config, mode }))
      .digest('hex')
      .slice(0, 16);
    this.file = path.resolve(directory, `${config.electionId}-${namespace}.json`);
  }
  async load(): Promise<StoredSnapshots | null> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as StoredSnapshots;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('לא ניתן לקרוא את המטמון השמור.');
    }
  }
  async save(data: StoredSnapshots): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(data), 'utf8');
    await rename(temporary, this.file);
  }
}
