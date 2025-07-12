import { ParsedEntry, ScrapedResult, ParseResult } from '@/src/types/vocabulary';
import { ScraperOrchestrator } from './scrapers';

export class WiktionaryScraperService {
  private static readonly DEFAULT_CONCURRENCY = 30;

  static async scrapeWords(
    words: ParsedEntry[],
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeWords(words, concurrency);
  }

  static async scrapeFirstDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeFirstDeclensionNouns(parseResult, concurrency);
  }

  static async scrapeSecondDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeSecondDeclensionNouns(parseResult, concurrency);
  }

  static async scrapeThirdDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeThirdDeclensionNouns(parseResult, concurrency);
  }

  static async scrapeFourthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeFourthDeclensionNouns(parseResult, concurrency);
  }

  static async scrapeFifthDeclensionNouns(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeFifthDeclensionNouns(parseResult, concurrency);
  }

  static async scrapeVerbs(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeVerbs(parseResult, concurrency);
  }

  static async scrapeAdjectives(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeAdjectives(parseResult, concurrency);
  }

  static async scrapeAllEntries(
    parseResult: ParseResult,
    concurrency: number = this.DEFAULT_CONCURRENCY
  ): Promise<ScrapedResult[]> {
    return await ScraperOrchestrator.scrapeAllEntries(parseResult, concurrency);
  }
}
