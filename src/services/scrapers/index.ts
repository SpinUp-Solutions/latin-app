import { ParsedEntry, ScrapedResult, ParseResult } from '@/src/types/vocabulary';
import { BrowserManager } from '../core/browser-manager';
import { WordFilters } from '../core/word-filters';
import { NounScraper } from './noun-scraper';
import { VerbScraper } from './verb-scraper';

export class ScraperOrchestrator {
  private static readonly DEFAULT_CONCURRENCY = 45;

  /**
   * Scrape words with automatic word type detection
   */
  static async scrapeWords(
    words: ParsedEntry[],
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const browser = await BrowserManager.launchBrowser();

    try {
      console.log(`Starting parallel scraping of ${words.length} words...`);
      return await this.scrapeWordsInParallel(words, browser, concurrency);
    } finally {
      await BrowserManager.closeBrowser(browser);
    }
  }

  /**
   * Scrape words in parallel batches
   */
  private static async scrapeWordsInParallel(
    words: ParsedEntry[],
    browser: any,
    concurrency: number
  ): Promise<ScrapedResult[]> {
    const results: ScrapedResult[] = [];
    const contexts = await BrowserManager.createBrowserContexts(browser);

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
          await BrowserManager.delay();
        }
      }
    } finally {
      await BrowserManager.closeBrowserContexts(contexts);
    }

    return results;
  }

  /**
   * Process a batch of words
   */
  private static async processBatch(batch: ParsedEntry[], contexts: any[]): Promise<ScrapedResult[]> {
    const batchPromises = batch.map(async (entry, index) => {
      const contextIndex = index % contexts.length;
      const context = contexts[contextIndex];

      try {
        const wiktionaryData = await this.scrapeByWordType(entry, context);
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
   * Scrape word using appropriate specialized scraper
   */
  private static async scrapeByWordType(entry: ParsedEntry, context: any) {
    switch (entry.wordType) {
      case 'noun':
        return await NounScraper.scrapeNoun(entry.wordForm, context);
      case 'verb':
        return await VerbScraper.scrapeVerb(entry.wordForm, context);
      default:
        // For other word types, use noun scraper as default (no specialized table extraction)
        return await NounScraper.scrapeNoun(entry.wordForm, context);
    }
  }

  // === CONVENIENT METHODS FOR SPECIFIC WORD TYPES ===

  /**
   * Scrape first declension nouns
   */
  static async scrapeFirstDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterFirstDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  /**
   * Scrape second declension nouns
   */
  static async scrapeSecondDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterSecondDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  /**
   * Scrape third declension nouns
   */
  static async scrapeThirdDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterThirdDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  /**
   * Scrape fourth declension nouns
   */
  static async scrapeFourthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterFourthDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  /**
   * Scrape fifth declension nouns
   */
  static async scrapeFifthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterFifthDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  /**
   * Scrape all verbs
   */
  static async scrapeVerbs(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const verbs = WordFilters.filterVerbs(parseResult);
    return await this.scrapeWords(verbs, concurrency);
  }

  /**
   * Scrape all adjectives
   */
  static async scrapeAdjectives(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const adjectives = WordFilters.filterAdjectives(parseResult);
    return await this.scrapeWords(adjectives, concurrency);
  }

  /**
   * Scrape all entries
   */
  static async scrapeAllEntries(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const allEntries = WordFilters.getAllEntries(parseResult);
    return await this.scrapeWords(allEntries, concurrency);
  }
}
