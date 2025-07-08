import { ParsedEntry, ScrapedResult, ParseResult } from '@/src/types/vocabulary';
import { BrowserManager } from '../core/browser-manager';
import { WordFilters } from '../core/word-filters';
import { NounScraper } from './noun-scraper';
import { VerbScraper } from './verb-scraper';
import { AdjectiveScraper } from './adjective-scraper';

export class ScraperOrchestrator {
  private static readonly DEFAULT_CONCURRENCY = 45;

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

        if (i + concurrency < words.length) {
          await BrowserManager.delay();
        }
      }
    } finally {
      await BrowserManager.closeBrowserContexts(contexts);
    }

    return results;
  }

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

  private static async scrapeByWordType(entry: ParsedEntry, context: any) {
    switch (entry.wordType) {
      case 'noun':
        return await NounScraper.scrapeNoun(entry.wordForm, context);
      case 'verb':
        return await VerbScraper.scrapeVerb(entry.wordForm, context);
      case 'adjective':
        return await AdjectiveScraper.scrapeAdjective(entry.wordForm, context);
      default:
        return await NounScraper.scrapeNoun(entry.wordForm, context);
    }
  }

  static async scrapeFirstDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterFirstDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  static async scrapeSecondDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterSecondDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  static async scrapeThirdDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterThirdDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  static async scrapeFourthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterFourthDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  static async scrapeFifthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const nouns = WordFilters.filterFifthDeclensionNouns(parseResult);
    return await this.scrapeWords(nouns, concurrency);
  }

  static async scrapeVerbs(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const verbs = WordFilters.filterVerbs(parseResult);
    return await this.scrapeWords(verbs, concurrency);
  }

  static async scrapeAdjectives(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const adjectives = WordFilters.filterAdjectives(parseResult);
    return await this.scrapeWords(adjectives, concurrency);
  }

  static async scrapeAllEntries(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    const allEntries = WordFilters.getAllEntries(parseResult);
    return await this.scrapeWords(allEntries, concurrency);
  }
}
