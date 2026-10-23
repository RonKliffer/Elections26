import os from 'node:os';
import path from 'node:path';

export function defaultCacheDirectory(): string {
  return process.env.VERCEL === '1' ? path.join(os.tmpdir(), 'elections26') : '.cache/elections';
}
