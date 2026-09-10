import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { ScraperConfig } from './types.js';

export class SourceBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(private readonly config: ScraperConfig) {}

  async start(): Promise<void> {
    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      userAgent: this.config.userAgent,
      viewport: { width: 1365, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.context = null;
    this.browser = null;
  }

  async getHtml(url: string): Promise<string> {
    if (!this.context) throw new Error('SourceBrowser.start() must be called before getHtml()');
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt += 1) {
      const page = await this.context.newPage();
      try {
        await this.politeDelay();
        await this.goto(page, url);
        return await page.content();
      } catch (error: unknown) {
        lastError = error;
        if (attempt <= this.config.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(2_000 * attempt, 5_000)));
        }
      } finally {
        await page.close().catch(() => undefined);
      }
    }

    throw new Error(`Failed to fetch ${url} after ${this.config.maxRetries + 1} attempts`, { cause: lastError });
  }

  private async goto(page: Page, url: string): Promise<void> {
    const response = await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.config.navigationTimeoutMs,
    });
    if (!response) throw new Error(`Navigation returned no response for ${url}`);
    if (response.status() >= 400) throw new Error(`Source returned HTTP ${response.status()} for ${url}`);
    await page.waitForLoadState('networkidle', { timeout: Math.min(this.config.navigationTimeoutMs, 8_000) }).catch(() => undefined);
  }

  private async politeDelay(): Promise<void> {
    if (this.config.requestDelayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.config.requestDelayMs));
  }
}
