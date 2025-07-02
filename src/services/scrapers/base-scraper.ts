import { BrowserContext, Locator } from 'playwright';
import { ParsedEntry, WiktionaryData } from '@/src/types/vocabulary';

export abstract class BaseScraper {
  /**
   * Extract etymology information from Latin section
   */
  protected static async extractEtymology(latinDiv: Locator, result: WiktionaryData): Promise<void> {
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

  /**
   * Extract pronunciation information from Latin section
   */
  protected static async extractPronunciation(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const pronunciationLocator = latinDiv
        .locator(
          'xpath=following-sibling::div[contains(@class,"mw-heading3")][.//*[@id and starts-with(@id,"Pronunciation")]][1]/following-sibling::ul[1]'
        )
        .first();

      if (await pronunciationLocator.isVisible()) {
        const text = await pronunciationLocator.textContent();
        if (text) result.pronunciation = text.trim();
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  /**
   * Extract multiple forms from a table cell that may contain multiple spans
   */
  protected static async extractMultipleForms(cell: Locator): Promise<string[]> {
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

  /**
   * Scrape Wiktionary data for a single word
   */
  protected static async scrapeWiktionary(word: string, context: BrowserContext): Promise<WiktionaryData | null> {
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

      // Determine if this is a verb or noun to extract appropriate data
      const verbSection = this.findVerbSection(latinDiv);
      const nounSection = this.findNounSection(latinDiv);

      const isVerb = (await verbSection.count()) > 0;
      const isNoun = (await nounSection.count()) > 0;

      await Promise.all([
        this.extractEtymology(latinDiv, result),
        this.extractPronunciation(latinDiv, result),
        isVerb ? this.extractVerbHeadingInfo(verbSection, result) : this.extractHeadingInfo(latinDiv, result),
        isVerb ? this.extractVerbDefinitions(verbSection, result) : this.extractDefinitions(latinDiv, result),
      ]);

      // Specific table extraction will be handled by specialized scrapers

      return result;
    } finally {
      await page.close();
    }
  }

  /**
   * Find the noun section under Latin
   */
  protected static findNounSection(latinDiv: Locator): Locator {
    return latinDiv
      .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Noun")]][1]')
      .first();
  }

  /**
   * Find the verb section under Latin
   */
  protected static findVerbSection(latinDiv: Locator): Locator {
    return latinDiv
      .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Verb")]][1]')
      .first();
  }

  /**
   * Extract general heading info (for nouns and other word types)
   */
  protected static async extractHeadingInfo(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const headingLocator = latinDiv
        .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][1]/following-sibling::p[1]//strong[1]')
        .first();

      if (await headingLocator.isVisible()) {
        const headingText = await headingLocator.textContent();
        if (headingText) {
          result.declension = headingText.trim();
        }
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  /**
   * Extract verb-specific heading info
   */
  protected static async extractVerbHeadingInfo(verbDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const headingLocator = verbDiv.locator('xpath=following-sibling::p[1]//strong[1]').first();

      if (await headingLocator.isVisible()) {
        const headingText = await headingLocator.textContent();
        if (headingText) {
          result.conjugation = headingText.includes('first') ? 'first conjugation' : headingText.trim();
          result.isDeponent = headingText.includes('deponent');
        }
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  /**
   * Extract general definitions
   */
  protected static async extractDefinitions(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const definitionsList = latinDiv
        .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][1]/following-sibling::ol[1]')
        .first();

      if (await definitionsList.isVisible()) {
        const listItems = await definitionsList.locator('li').all();
        for (const item of listItems) {
          const text = await item.textContent();
          if (text) result.definitions.push(text.trim());
        }
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  /**
   * Extract verb-specific definitions
   */
  protected static async extractVerbDefinitions(verbDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const definitionsList = verbDiv.locator('xpath=following-sibling::ol[1]').first();

      if (await definitionsList.isVisible()) {
        const listItems = await definitionsList.locator('li').all();
        for (const item of listItems) {
          const text = await item.textContent();
          if (text) result.definitions.push(text.trim());
        }
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }
}
