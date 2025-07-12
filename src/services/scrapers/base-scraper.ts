import { BrowserContext, Locator } from 'playwright';
import { WiktionaryData } from '@/src/types/vocabulary';

export abstract class BaseScraper {
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

  protected static async extractMultipleForms(cell: Locator): Promise<string[]> {
    const forms: string[] = [];

    const spans = await cell.locator('span.Latn').all();

    if (spans.length > 0) {
      for (const span of spans) {
        const text = await span.textContent();
        if (text && text.trim()) {
          forms.push(text.trim());
        }
      }
    } else {
      const cellText = await cell.textContent();
      if (cellText && cellText.trim()) {
        const cleanText = cellText.trim();
        forms.push(cleanText);
      }
    }

    return Array.from(new Set(forms.filter(form => form && form.length > 0)));
  }

  protected static async scrapeWiktionary(
    word: string,
    context: BrowserContext,
    intendedWordType?: 'noun' | 'verb' | 'adjective'
  ): Promise<WiktionaryData | null> {
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

      const verbSection = this.findVerbSection(latinDiv);
      const nounSection = this.findNounSection(latinDiv);
      const adjectiveSection = this.findAdjectiveSection(latinDiv);

      // Determine which section to use based on intended word type
      let targetSection: Locator;
      let useVerbExtraction = false;

      if (intendedWordType) {
        if (intendedWordType === 'verb') {
          targetSection = verbSection;
          useVerbExtraction = true;
        } else if (intendedWordType === 'adjective') {
          targetSection = adjectiveSection;
          useVerbExtraction = false;
        } else {
          targetSection = nounSection;
          useVerbExtraction = false;
        }
      } else {
        // Fallback to original detection logic
        const isVerb = (await verbSection.count()) > 0;
        const isAdjective = (await adjectiveSection.count()) > 0;

        if (isVerb) {
          targetSection = verbSection;
          useVerbExtraction = true;
        } else if (isAdjective) {
          targetSection = adjectiveSection;
          useVerbExtraction = false;
        } else {
          targetSection = nounSection;
          useVerbExtraction = false;
        }
      }

      await Promise.all([
        this.extractEtymology(latinDiv, result),
        this.extractPronunciation(latinDiv, result),
        useVerbExtraction
          ? this.extractVerbHeadingInfo(targetSection, result)
          : this.extractHeadingInfo(latinDiv, result),
        useVerbExtraction
          ? this.extractVerbDefinitions(targetSection, result)
          : intendedWordType === 'adjective'
            ? this.extractAdjectiveDefinitions(targetSection, result)
            : this.extractDefinitions(latinDiv, result),
      ]);

      return result;
    } finally {
      await page.close();
    }
  }

  protected static findNounSection(latinDiv: Locator): Locator {
    return latinDiv
      .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Noun")]][1]')
      .first();
  }

  protected static findVerbSection(latinDiv: Locator): Locator {
    return latinDiv
      .locator('xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Verb")]][1]')
      .first();
  }

  protected static findAdjectiveSection(latinDiv: Locator): Locator {
    return latinDiv
      .locator(
        'xpath=following-sibling::div[contains(@class,"mw-heading")][.//*[@id and starts-with(@id,"Adjective")]][1]'
      )
      .first();
  }

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
    } catch (error) {}
  }

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

  protected static async extractAdjectiveDefinitions(adjectiveDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const definitionsList = adjectiveDiv.locator('xpath=following-sibling::ol[1]').first();

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
