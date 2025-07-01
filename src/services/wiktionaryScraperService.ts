import { chromium, Browser, BrowserContext, Locator } from 'playwright';
import { ParsedEntry, WiktionaryData, ScrapedResult, DeclensionData, ParseResult } from '@/src/types/vocabulary';

export class WiktionaryScraperService {
  private static readonly DEFAULT_CONCURRENCY = 45;
  private static readonly DEFAULT_CONTEXTS = 4;
  private static readonly BATCH_DELAY = 75; // ms

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

  static async scrapeWords(
    words: ParsedEntry[],
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const browser = await this.launchBrowser();

    try {
      console.log(`Starting parallel scraping of ${words.length} words...`);
      return await this.scrapeWordsInParallel(words, browser, concurrency);
    } finally {
      await browser.close();
    }
  }

  private static async launchBrowser(): Promise<Browser> {
    return await chromium.launch({
      headless: true,
      args: this.BROWSER_ARGS,
    });
  }

  private static async scrapeWordsInParallel(
    words: ParsedEntry[],
    browser: Browser,
    concurrency: number
  ): Promise<ScrapedResult[]> {
    const results: ScrapedResult[] = [];
    const contexts = await this.createBrowserContexts(browser);

    try {
      for (let i = 0; i < words.length; i += concurrency) {
        const batch = words.slice(i, i + concurrency);
        console.log(
          `Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(words.length / concurrency)} (${batch.length} words)`
        );

        const batchResults = await this.processBatch(batch, contexts);
        results.push(...batchResults);

        // Add delay between batches to avoid overwhelming the server
        if (i + concurrency < words.length) {
          await this.delay(this.BATCH_DELAY);
        }
      }
    } finally {
      await this.closeBrowserContexts(contexts);
    }

    return results;
  }

  private static async createBrowserContexts(browser: Browser): Promise<BrowserContext[]> {
    console.log(`Creating ${this.DEFAULT_CONTEXTS} browser contexts for concurrent requests`);

    return await Promise.all(
      Array.from({ length: this.DEFAULT_CONTEXTS }, () =>
        browser.newContext({
          userAgent: this.USER_AGENT,
        })
      )
    );
  }

  private static async closeBrowserContexts(contexts: BrowserContext[]): Promise<void> {
    await Promise.all(contexts.map(context => context.close()));
  }

  private static async processBatch(batch: ParsedEntry[], contexts: BrowserContext[]): Promise<ScrapedResult[]> {
    const batchPromises = batch.map(async (entry, index) => {
      const contextIndex = index % contexts.length;
      const context = contexts[contextIndex];

      try {
        const wiktionaryData = await this.scrapeWiktionary(entry.wordForm, context);
        return {
          word: entry.wordForm,
          parsedData: entry,
          wiktionaryData,
        };
      } catch (error) {
        return {
          word: entry.wordForm,
          parsedData: entry,
          wiktionaryData: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    return batchResults
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<ScrapedResult>).value);
  }

  /**
   * Scrape Wiktionary data for a single word
   */
  private static async scrapeWiktionary(word: string, context: BrowserContext): Promise<WiktionaryData | null> {
    const page = await context.newPage();

    try {
      await page.goto(`https://en.wiktionary.org/wiki/${word}`, { waitUntil: 'networkidle' });

      const latinDiv = page.locator('div.mw-heading.mw-heading2:has(> h2#Latin)').first();
      if (!(await latinDiv.count())) {
        return null;
      }

      const result: WiktionaryData = {
        word,
        definitions: [],
      };

      await Promise.all([
        this.extractEtymology(latinDiv, result),
        this.extractPronunciation(latinDiv, result),
        this.extractHeadingInfo(latinDiv, result),
        this.extractDefinitions(latinDiv, result),
        this.extractDeclensionTable(latinDiv, result),
      ]);

      return result;
    } finally {
      await page.close();
    }
  }

  private static async extractEtymology(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const etymologyLocator = latinDiv
        .locator(
          'xpath=following-sibling::div[contains(@class,"mw-heading3")][.//*[@id and starts-with(@id,"Etymology")]][1]/following-sibling::p[1]'
        )
        .first();

      if (await etymologyLocator.isVisible()) {
        const text = await etymologyLocator.textContent();
        if (text) result.etymology = text.trim();
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  private static async extractPronunciation(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const pronunciationLocator = latinDiv
        .locator(
          'xpath=following-sibling::div[contains(@class,"mw-heading3")][.//*[@id and starts-with(@id,"Pronunciation")]][1]/following-sibling::ul[1]/li[1]'
        )
        .first();

      if (await pronunciationLocator.isVisible()) {
        const text = await pronunciationLocator.textContent();
        if (text) result.pronunciation = text.trim();
      }
    } catch (error) {}
  }
  private static async extractHeadingInfo(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const headPara = latinDiv.locator('xpath=following-sibling::p[1]').first();

      if (await headPara.isVisible()) {
        const text = await headPara.textContent();
        if (!text) return;

        const genderMatch = text.match(/\b([mfn])\b/);
        const declensionMatch = text.match(/(first|second|third|fourth|fifth)\s+declension/i);

        if (genderMatch) result.gender = genderMatch[1];
        if (declensionMatch) {
          result.declension = declensionMatch[0];
        }
      }
    } catch (error) {}
  }

  private static async extractDefinitions(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      // Try to find noun definitions first (since we're primarily scraping nouns)
      const nounDiv = latinDiv
        .locator(
          'xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Noun")]][1]'
        )
        .first();

      if ((await nounDiv.count()) > 0) {
        const definitionList = await nounDiv.locator('xpath=following-sibling::ol[1]/li').all();

        for (const li of definitionList) {
          const text = await li.textContent();
          if (text?.trim()) {
            result.definitions.push(text.trim());
          }
        }
      } else {
        // Fallback: try to find any definition list after the Latin section
        const definitionList = await latinDiv.locator('xpath=following-sibling::ol[1]/li').all();

        for (const li of definitionList) {
          const text = await li.textContent();
          if (text?.trim()) {
            result.definitions.push(text.trim());
          }
        }
      }
    } catch (error) {}
  }

  private static async extractDeclensionTable(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const declensionDiv = latinDiv
        .locator(
          'xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Declension")]][1]'
        )
        .first();

      const table = declensionDiv
        .locator(
          'xpath=following-sibling::div[contains(@class,"inflection-table-wrapper")]//table[contains(@class,"inflection-table")]'
        )
        .first();

      if (await table.count()) {
        result.declensionTable = await this.extractTableData(table);
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  private static async extractTableData(table: Locator): Promise<DeclensionData[]> {
    const rows = await table.locator('tr').all();
    const data: DeclensionData[] = [];

    for (let i = 1; i < rows.length; i++) {
      const cells = await rows[i].locator('th, td').all();
      if (cells.length < 3) continue;

      const [caseCell, singularCell, pluralCell] = cells.slice(0, 3);
      const [caseText, singularText, pluralText] = await Promise.all([
        caseCell.textContent(),
        singularCell.textContent(),
        pluralCell.textContent(),
      ]);

      if (caseText && singularText && pluralText) {
        data.push({
          case: caseText.trim(),
          singular: singularText.trim(),
          plural: pluralText.trim(),
        });
      }
    }

    return data;
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Scrape Wiktionary data for first declension nouns specifically
   */
  static async scrapeFirstDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const firstDeclensionNouns = this.filterFirstDeclensionNouns(parseResult);
    console.log(`Found ${firstDeclensionNouns.length} first declension nouns to scrape`);

    if (firstDeclensionNouns.length === 0) {
      console.log('No first declension nouns found to scrape');
      return [];
    }

    return await this.scrapeWords(firstDeclensionNouns, concurrency);
  }

  /**
   * Scrape Wiktionary data for second declension nouns specifically
   */
  static async scrapeSecondDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const secondDeclensionNouns = this.filterSecondDeclensionNouns(parseResult);
    console.log(`Found ${secondDeclensionNouns.length} second declension nouns to scrape`);

    if (secondDeclensionNouns.length === 0) {
      console.log('No second declension nouns found to scrape');
      return [];
    }

    return await this.scrapeWords(secondDeclensionNouns, concurrency);
  }

  /**
   * Scrape Wiktionary data for verbs specifically
   * TODO: Implement when needed
   */
  static async scrapeVerbs(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    // Implementation coming soon
    throw new Error('Verb scraping not yet implemented');
  }

  /**
   * Filter entries to get only first declension nouns
   */
  private static filterFirstDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries: ParsedEntry[] = Object.values(parseResult.sections).flat();
    return allEntries.filter((entry: ParsedEntry) => entry.wordType === 'noun' && entry.declensionClass === '1st');
  }

  /**
   * Filter entries to get only second declension nouns
   */
  private static filterSecondDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries: ParsedEntry[] = Object.values(parseResult.sections).flat();
    return allEntries.filter((entry: ParsedEntry) => entry.wordType === 'noun' && entry.declensionClass === '2nd');
  }
}
