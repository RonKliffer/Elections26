import { chromium, webkit } from 'playwright';
import type { ElectionConfig, ElectionSnapshot } from '../types';
import type { ElectionSourceAdapter } from '../source';
import { normalizeOfficial2026 } from '../source2026';

/** Normal page navigation in a disposable browser, including the site's own JS verification. */
export class Browser2026Adapter implements ElectionSourceAdapter {
  constructor(
    private readonly timeoutMs = 30000,
    private readonly channel = process.platform === 'darwin' ? 'chrome' : undefined,
    private readonly now = () => new Date(),
    private readonly engineName: 'webkit' | 'chromium' = 'webkit',
  ) {}

  async fetchSnapshot(config: ElectionConfig): Promise<ElectionSnapshot> {
    const html = await this.fetchNationalHtml(config);
    return normalizeOfficial2026(html, config, this.now().toISOString());
  }

  async fetchNationalHtml(config: ElectionConfig): Promise<string> {
    const source = new URL(config.sourceUrl);
    if (source.protocol !== 'https:' || source.hostname !== 'votes26.bechirot.gov.il')
      throw new Error('שליפה דרך דפדפן מותרת רק מהמקור הרשמי של בחירות 2026.');
    const deadline = Date.now() + this.timeoutMs;
    const remaining = () => Math.max(1, deadline - Date.now());
    const engine = this.engineName === 'webkit' ? webkit : chromium;
    const browser = await engine.launch({
      ...(engine === chromium ? { channel: this.channel, chromiumSandbox: true } : {}),
      headless: true,
      timeout: remaining(),
    });
    try {
      const context = await browser.newContext({ locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
      const page = await context.newPage();
      await page.goto(config.sourceUrl, { waitUntil: 'domcontentloaded', timeout: remaining() });
      // A JavaScript verification page can reload before the results appear.
      // We do not solve CAPTCHAs, reuse personal cookies, or weaken TLS checks.
      try {
        await page.locator('table thead th[id$="_validVotesForParty"]').waitFor({
          state: 'attached',
          timeout: remaining(),
        });
      } catch (error) {
        throw new Error('המקור הרשמי לא הציג טבלת תוצאות לאחר אימות הדפדפן.', { cause: error });
      }
      if (new URL(page.url()).origin !== source.origin)
        throw new Error('הדפדפן הועבר לכתובת שאינה המקור הרשמי.');
      const html = await page.content();
      if (html.length > 8_000_000) throw new Error('גודל תשובת המקור אינו תקין.');
      return html;
    } finally {
      await browser.close();
    }
  }
}
