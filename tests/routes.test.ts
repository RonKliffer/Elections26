import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  refresh: vi.fn(async () => {}),
  getState: vi.fn(() => ({ connection: 'fresh', snapshot: { validVotes: 4764742 } })),
}));
vi.mock('../src/lib/server/runtime', () => ({ getElectionService: () => fake }));
import { GET } from '../src/app/api/results/route';
import { POST } from '../src/app/api/refresh/route';
beforeEach(() => {
  vi.clearAllMocks();
});
describe('dashboard HTTP endpoints', () => {
  it.each(['load', 'manual'])(
    'returns a diagnostic JSON response when %s fails unexpectedly',
    async (kind) => {
      const failure = new Error('private server configuration detail');
      fake.refresh.mockRejectedValueOnce(failure);
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await (kind === 'load'
          ? GET()
          : POST(new Request('http://localhost/api/refresh', { method: 'POST' })));
        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        const body = await response.json();
        expect(body.code).toBe('RESULTS_SERVICE_UNAVAILABLE');
        expect(body.error).toBeTruthy();
        expect(JSON.stringify(body)).not.toContain(failure.message);
        expect(log).toHaveBeenCalledWith(expect.any(String), failure);
      } finally {
        log.mockRestore();
      }
    },
  );
  it('refreshes on page load with browser caching disabled', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).snapshot.validVotes).toBe(4764742);
    expect(fake.refresh).toHaveBeenCalledOnce();
  });
  it('joins the shared manual refresh', async () => {
    const response = await POST(
      new Request('http://127.0.0.1:3000/api/refresh', {
        method: 'POST',
        headers: { origin: 'http://127.0.0.1:3000' },
      }),
    );
    expect(response.status).toBe(200);
    expect(fake.refresh).toHaveBeenCalledExactlyOnceWith();
  });
  it.each(['load', 'manual'])('awaits a cold %s fetch before returning data', async (kind) => {
    let complete!: () => void;
    fake.refresh.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
    let returned = false;
    const pending = (
      kind === 'load'
        ? GET()
        : POST(new Request('http://localhost/api/refresh', { method: 'POST' }))
    ).then((response) => {
      returned = true;
      return response;
    });
    await Promise.resolve();
    expect(returned).toBe(false);
    expect(fake.getState).not.toHaveBeenCalled();
    complete();
    expect((await pending).status).toBe(200);
    expect(fake.getState).toHaveBeenCalledOnce();
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
