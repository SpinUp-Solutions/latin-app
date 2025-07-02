import { chromium, Browser, BrowserContext } from 'playwright';

export class BrowserManager {
  private static readonly DEFAULT_CONTEXTS = 4;
  private static readonly BATCH_DELAY = 75;

  private static readonly BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-popup-blocking',
  ];

  private static readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

  static async launchBrowser(): Promise<Browser> {
    return await chromium.launch({
      headless: true,
      args: this.BROWSER_ARGS,
    });
  }

  static async createBrowserContexts(
    browser: Browser,
    count: number = this.DEFAULT_CONTEXTS
  ): Promise<BrowserContext[]> {
    console.log(`Creating ${count} browser contexts for concurrent requests`);

    return await Promise.all(
      Array.from({ length: count }, () =>
        browser.newContext({
          userAgent: this.USER_AGENT,
        })
      )
    );
  }

  static async closeBrowserContexts(contexts: BrowserContext[]): Promise<void> {
    await Promise.all(contexts.map(context => context.close()));
  }

  static async closeBrowser(browser: Browser): Promise<void> {
    await browser.close();
  }

  static async delay(ms: number = this.BATCH_DELAY): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static getDefaults() {
    return {
      contexts: this.DEFAULT_CONTEXTS,
      batchDelay: this.BATCH_DELAY,
      userAgent: this.USER_AGENT,
    };
  }
}
