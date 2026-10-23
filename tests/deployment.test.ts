import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultCacheDirectory } from '../src/lib/server/deployment';

afterEach(() => vi.unstubAllEnvs());
describe('deployment cache defaults', () => {
  it('uses writable temporary storage on Vercel', () => {
    vi.stubEnv('VERCEL', '1');
    expect(defaultCacheDirectory()).toBe(path.join(os.tmpdir(), 'elections26'));
  });
  it('keeps persistent project storage for a normal Node server', () => {
    vi.stubEnv('VERCEL', '');
    expect(defaultCacheDirectory()).toBe('.cache/elections');
  });
});
