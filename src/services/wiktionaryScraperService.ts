import { chromium, Browser, BrowserContext, Locator } from 'playwright';
import { ParsedEntry, WiktionaryData, ScrapedResult, DeclensionData, ParseResult } from '@/src/types/vocabulary';
import { VocabularyParserService } from './vocabularyParserService';

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
   * Helper to find the noun section under Latin
   */
  private static findNounSection(latinDiv: Locator): Locator {
    return latinDiv
      .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Noun")]][1]')
      .first();
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
      // Look for noun section first, fallback to first paragraph after Latin
      const nounDiv = this.findNounSection(latinDiv);

      const headPara =
        (await nounDiv.count()) > 0
          ? nounDiv.locator('xpath=following-sibling::p[1]').first()
          : latinDiv.locator('xpath=following-sibling::p[1]').first();

      if (await headPara.isVisible()) {
        const text = await headPara.textContent();
        if (!text) return;

        const genderMatch = text.match(/\b([mfn])\b/);
        const declensionMatch = text.match(/(first|second|third|fourth|fifth)\s+declension/i);

        if (genderMatch) result.gender = genderMatch[1];
        if (declensionMatch) result.declension = declensionMatch[0];
      }
    } catch (error) {}
  }

  private static async extractDefinitions(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      // Look for noun definitions first, fallback to first definition list after Latin
      const nounDiv = this.findNounSection(latinDiv);

      const definitionLocator =
        (await nounDiv.count()) > 0
          ? nounDiv.locator('xpath=following-sibling::ol[1]/li')
          : latinDiv.locator('xpath=following-sibling::ol[1]/li');

      const definitionList = await definitionLocator.all();

      for (const li of definitionList) {
        const text = await li.textContent();
        if (text?.trim()) {
          result.definitions.push(text.trim());
        }
      }
    } catch (error) {}
  }

  private static async extractDeclensionTable(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      // Find noun section first for more accurate targeting
      const nounDiv = this.findNounSection(latinDiv);

      let table: Locator;

      if ((await nounDiv.count()) > 0) {
        // Try declension section after noun, then direct table after noun
        const declensionDiv = nounDiv
          .locator(
            'xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Declension")]][1]'
          )
          .first();

        table =
          (await declensionDiv.count()) > 0
            ? declensionDiv
                .locator(
                  'xpath=following-sibling::div[contains(@class,"inflection-table-wrapper")]//table[contains(@class,"inflection-table")]'
                )
                .first()
            : nounDiv
                .locator(
                  'xpath=following-sibling::div[contains(@class,"inflection-table-wrapper")]//table[contains(@class,"inflection-table")][1]'
                )
                .first();
      } else {
        // Fallback: first declension section after Latin
        const declensionDiv = latinDiv
          .locator(
            'xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Declension")]][1]'
          )
          .first();

        table = declensionDiv
          .locator(
            'xpath=following-sibling::div[contains(@class,"inflection-table-wrapper")]//table[contains(@class,"inflection-table")]'
          )
          .first();
      }

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

      // Extract case name
      const caseText = await caseCell.textContent();
      if (!caseText) continue;

      // Extract multiple forms from singular cell
      const singularForms = await this.extractMultipleForms(singularCell);

      // Extract multiple forms from plural cell
      const pluralForms = await this.extractMultipleForms(pluralCell);

      if (singularForms.length > 0 && pluralForms.length > 0) {
        data.push({
          case: caseText.trim(),
          singular: singularForms,
          plural: pluralForms,
        });
      }
    }

    return data;
  }

  /**
   * Extract multiple forms from a table cell that may contain multiple spans
   */
  private static async extractMultipleForms(cell: Locator): Promise<string[]> {
    const forms: string[] = [];

    // First, try to find spans within the cell
    const spans = await cell.locator('span.Latn').all();

    if (spans.length > 0) {
      // Extract text from each span
      for (const span of spans) {
        const text = await span.textContent();
        if (text && text.trim()) {
          forms.push(text.trim());
        }
      }
    } else {
      // Fallback: get the entire cell content and split if needed
      const cellText = await cell.textContent();
      if (cellText && cellText.trim()) {
        // Sometimes multiple forms are separated by commas or spaces
        const cleanText = cellText.trim();
        // Only add as single form if it doesn't look like multiple concatenated forms
        forms.push(cleanText);
      }
    }

    // Filter out any empty strings and return unique forms
    return Array.from(new Set(forms.filter(form => form && form.length > 0)));
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
   * Scrape Wiktionary data for third declension nouns specifically
   */
  static async scrapeThirdDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const thirdDeclensionNouns = this.filterThirdDeclensionNouns(parseResult);
    console.log(`Found ${thirdDeclensionNouns.length} third declension nouns to scrape`);

    if (thirdDeclensionNouns.length === 0) {
      console.log('No third declension nouns found to scrape');
      return [];
    }

    return await this.scrapeWords(thirdDeclensionNouns, concurrency);
  }

  /**
   * Scrape Wiktionary data for fourth declension nouns specifically
   */
  static async scrapeFourthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const fourthDeclensionNouns = this.filterFourthDeclensionNouns(parseResult);
    console.log(`Found ${fourthDeclensionNouns.length} fourth declension nouns to scrape`);

    if (fourthDeclensionNouns.length === 0) {
      console.log('No fourth declension nouns found to scrape');
      return [];
    }

    return await this.scrapeWords(fourthDeclensionNouns, concurrency);
  }

  /**
   * Scrape Wiktionary data for fifth declension nouns specifically
   */
  static async scrapeFifthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const fifthDeclensionNouns = this.filterFifthDeclensionNouns(parseResult);
    console.log(`Found ${fifthDeclensionNouns.length} fifth declension nouns to scrape`);

    if (fifthDeclensionNouns.length === 0) {
      console.log('No fifth declension nouns found to scrape');
      return [];
    }

    return await this.scrapeWords(fifthDeclensionNouns, concurrency);
  }

  /**
   * Scrape Wiktionary data for verbs specifically
   */
  static async scrapeVerbs(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const verbs = this.filterVerbs(parseResult);
    console.log(`Found ${verbs.length} verbs to scrape`);

    if (verbs.length === 0) {
      console.log('No verbs found to scrape');
      return [];
    }

    return await this.scrapeWords(verbs, concurrency);
  }

  /**
   * Scrape Wiktionary data for adjectives specifically
   */
  static async scrapeAdjectives(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const adjectives = this.filterAdjectives(parseResult);
    console.log(`Found ${adjectives.length} adjectives to scrape`);

    if (adjectives.length === 0) {
      console.log('No adjectives found to scrape');
      return [];
    }

    return await this.scrapeWords(adjectives, concurrency);
  }

  /**
   * Scrape Wiktionary data for all entries
   */
  static async scrapeAllEntries(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const allEntries = this.getAllEntries(parseResult);
    console.log(`Found ${allEntries.length} total entries to scrape`);

    if (allEntries.length === 0) {
      console.log('No entries found to scrape');
      return [];
    }

    return await this.scrapeWords(allEntries, concurrency);
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

  /**
   * Filter entries to get only third declension nouns
   */
  private static filterThirdDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries: ParsedEntry[] = Object.values(parseResult.sections).flat();
    return allEntries.filter((entry: ParsedEntry) => entry.wordType === 'noun' && entry.declensionClass === '3rd');
  }

  /**
   * Filter entries to get only fourth declension nouns
   */
  private static filterFourthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries: ParsedEntry[] = Object.values(parseResult.sections).flat();
    return allEntries.filter((entry: ParsedEntry) => entry.wordType === 'noun' && entry.declensionClass === '4th');
  }

  /**
   * Filter entries to get only fifth declension nouns
   */
  private static filterFifthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries: ParsedEntry[] = Object.values(parseResult.sections).flat();
    return allEntries.filter((entry: ParsedEntry) => entry.wordType === 'noun' && entry.declensionClass === '5th');
  }

  /**
   * Filter entries to get verbs
   */
  private static filterVerbs(parseResult: ParseResult): ParsedEntry[] {
    const allEntries: ParsedEntry[] = Object.values(parseResult.sections).flat();
    return allEntries.filter((entry: ParsedEntry) => entry.wordType === 'verb');
  }

  /**
   * Filter entries to get adjectives
   */
  private static filterAdjectives(parseResult: ParseResult): ParsedEntry[] {
    const allEntries: ParsedEntry[] = Object.values(parseResult.sections).flat();
    return allEntries.filter((entry: ParsedEntry) => entry.wordType === 'adjective');
  }

  /**
   * Get all entries flattened from all sections
   */
  private static getAllEntries(parseResult: ParseResult): ParsedEntry[] {
    return Object.values(parseResult.sections).flat();
  }
}
