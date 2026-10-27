import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { electionConfig } from '../src/config/election';
import { Browser2026Adapter } from '../src/lib/server/browser-source';
import { Official2026Adapter } from '../src/lib/source2026';

const fake = vi.hoisted(() => ({
  launch: vi.fn(),
  newContext: vi.fn(),
  newPage: vi.fn(),
  goto: vi.fn(),
  locator: vi.fn(),
  waitFor: vi.fn(),
  url: vi.fn(),
  content: vi.fn(),
  close: vi.fn(),
}));
vi.mock('playwright', () => ({
  chromium: { launch: fake.launch },
  webkit: { launch: fake.launch },
}));
const html = await readFile('fixtures/2026/source.html', 'utf8');
const capturedAt = '2026-10-27T23:00:00.000Z';
beforeEach(() => {
  vi.resetAllMocks();
  fake.launch.mockResolvedValue({ newContext: fake.newContext, close: fake.close });
  fake.newContext.mockResolvedValue({ newPage: fake.newPage });
  fake.newPage.mockResolvedValue({
    goto: fake.goto,
    locator: fake.locator,
    content: fake.content,
    url: fake.url,
  });
  fake.locator.mockReturnValue({ waitFor: fake.waitFor });
  fake.url.mockReturnValue('https://votes26.bechirot.gov.il/');
  fake.content.mockResolvedValue(html);
});
describe('isolated official browser transport', () => {
  it('defaults to WebKit, which can complete the official site verification', async () => {
    const snapshot = await new Browser2026Adapter().fetchSnapshot(electionConfig);
    expect(snapshot.validVotes).toBe(2661);
    expect(fake.launch).toHaveBeenCalledWith({ headless: true, timeout: expect.any(Number) });
    expect(fake.close).toHaveBeenCalledOnce();
  });
  it('navigates normally, waits for verification to finish, validates the page and closes the browser', async () => {
    const snapshot = await new Browser2026Adapter(
      30000,
      'chrome',
      () => new Date(capturedAt),
      'chromium',
    ).fetchSnapshot(electionConfig);
    expect(snapshot).toMatchObject({ validVotes: 2661, mode: 'official', retrievedAt: capturedAt });
    expect(fake.launch).toHaveBeenCalledWith(
      expect.objectContaining({ headless: true, chromiumSandbox: true, channel: 'chrome' }),
    );
    expect(fake.newContext).toHaveBeenCalledWith({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
    expect(fake.goto).toHaveBeenCalledWith(
      electionConfig.sourceUrl,
      expect.objectContaining({ waitUntil: 'domcontentloaded' }),
    );
    expect(fake.waitFor).toHaveBeenCalledOnce();
    expect(fake.close).toHaveBeenCalledOnce();
  });
  it.each(['verification', 'markup', 'redirect'])(
    'fails safely on %s and releases the browser',
    async (failure) => {
      if (failure === 'verification')
        fake.waitFor.mockRejectedValue(new Error('Verification did not finish'));
      if (failure === 'markup') fake.content.mockResolvedValue('<h1>maintenance</h1>');
      if (failure === 'redirect') fake.url.mockReturnValue('https://unrelated.example/');
      await expect(new Browser2026Adapter().fetchSnapshot(electionConfig)).rejects.toThrow();
      expect(fake.close).toHaveBeenCalledOnce();
    },
  );
  it('refuses nonofficial URLs before launching a browser', async () => {
    await expect(
      new Browser2026Adapter().fetchSnapshot({
        ...electionConfig,
        sourceUrl: 'https://example.com',
      }),
    ).rejects.toThrow(/הרשמי/);
    expect(fake.launch).not.toHaveBeenCalled();
  });
  it('recovers from a blocked server response using a new live browser page', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const browser = new Browser2026Adapter(30000, 'chrome', () => new Date(capturedAt));
    const snapshot = await new Official2026Adapter(
      request,
      1000,
      () => new Date(capturedAt),
      browser,
    ).fetchSnapshot(electionConfig);
    expect(snapshot.validVotes).toBe(2661);
    expect(fake.launch).toHaveBeenCalledOnce();
  });
  it('does not hide malformed live results with another transport', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<h1>Changed markup</h1>'));
    const browser = new Browser2026Adapter();
    await expect(
      new Official2026Adapter(request, 1000, () => new Date(capturedAt), browser).fetchSnapshot(
        electionConfig,
      ),
    ).rejects.toThrow();
    expect(fake.launch).not.toHaveBeenCalled();
  });
});
