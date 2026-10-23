import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  refresh: vi.fn(async (_manual?: boolean) => {}),
  getState: vi.fn(() => ({ connection: 'fresh', snapshot: { validVotes: 4764742 } })),
}));
vi.mock('../src/lib/server/runtime', () => ({ getElectionService: () => fake }));
import { GET } from '../src/app/api/results/route';
import { POST } from '../src/app/api/refresh/route';
beforeEach(() => {
  vi.clearAllMocks();
});
describe('dashboard HTTP endpoints', () => {
  it('returns cached state with browser caching disabled', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).snapshot.validVotes).toBe(4764742);
    expect(fake.start).toHaveBeenCalledOnce();
    expect(fake.refresh).not.toHaveBeenCalled();
  });
  it('joins the shared manual refresh', async () => {
    const response = await POST(
      new Request('http://127.0.0.1:3000/api/refresh', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:3000' },
      }),
    );
    expect(response.status).toBe(200);
    expect(fake.refresh).toHaveBeenCalledWith(true);
  });
  it('works behind an HTTPS reverse proxy preserving the public Host', async () => {
    const response = await POST(
      new Request('http://127.0.0.1:3000/api/refresh', {
        method: 'POST',
        headers: { origin: 'https://results.example.com', host: 'results.example.com' },
      }),
    );
    expect(response.status).toBe(200);
  });
  it('rejects a cross-site browser refresh', async () => {
    const response = await POST(
      new Request('http://127.0.0.1:3000/api/refresh', {
        method: 'POST',
        headers: { origin: 'https://unrelated.example' },
      }),
    );
    expect(response.status).toBe(403);
    expect(fake.refresh).not.toHaveBeenCalled();
  });
});
