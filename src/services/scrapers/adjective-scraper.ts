import { BrowserContext, Locator } from 'playwright';
import { WiktionaryData, AdjectiveDeclensionData } from '@/src/types/vocabulary';
import { BaseScraper } from './base-scraper';

export class AdjectiveScraper extends BaseScraper {
  static async scrapeAdjective(word: string, context: BrowserContext): Promise<WiktionaryData | null> {
    const result = await this.scrapeWiktionary(word, context, 'adjective');
    if (!result) return null;

    const page = await context.newPage();
    try {
      await page.goto(`https://en.wiktionary.org/wiki/${word}`, { waitUntil: 'networkidle' });

      const latinDiv = page.locator('div.mw-heading.mw-heading2:has(> h2#Latin)').first();
      if (await latinDiv.count()) {
        const adjectiveSection = AdjectiveScraper.findAdjectiveSection(latinDiv);
        if (await adjectiveSection.count()) {
          await this.extractAdjectiveDeclensionTable(adjectiveSection, result);
        }
      }

      return result;
    } finally {
      await page.close();
    }
  }

  private static async extractAdjectiveDeclensionTable(adjectiveDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      // Look for the declension table within the adjective section, but not in subsequent sections
      const table = adjectiveDiv
        .locator(
          'xpath=following-sibling::*[not(self::div[contains(@class,"mw-heading2")])]//table[contains(@class,"inflection")]'
        )
        .first();

      if (await table.count()) {
        result.adjectiveDeclensionTable = await this.extractAdjectiveTableData(table);
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  private static async extractAdjectiveTableData(table: Locator): Promise<AdjectiveDeclensionData[]> {
    const data: AdjectiveDeclensionData[] = [];

    try {
      const rows = await table.locator('tr').all();

      // Skip header rows and process data rows
      for (let i = 1; i < rows.length; i++) {
        const cells = await rows[i].locator('th, td').all();

        // Adjective tables should have 7 columns: case + 6 gender/number combinations
        if (cells.length < 7) continue;

        const caseCell = cells[0];
        const caseText = await caseCell.textContent();
        if (!caseText) continue;

        // Extract forms for all 6 gender/number combinations
        const masculineSingular = await this.extractMultipleForms(cells[1]);
        const feminineSingular = await this.extractMultipleForms(cells[2]);
        const neuterSingular = await this.extractMultipleForms(cells[3]);
        const masculinePlural = await this.extractMultipleForms(cells[4]);
        const femininePlural = await this.extractMultipleForms(cells[5]);
        const neuterPlural = await this.extractMultipleForms(cells[6]);

        // Only add if we have at least some forms
        if (masculineSingular.length > 0 || feminineSingular.length > 0 || neuterSingular.length > 0) {
          data.push({
            case: caseText.trim(),
            masculine: {
              singular: masculineSingular,
              plural: masculinePlural,
            },
            feminine: {
              singular: feminineSingular,
              plural: femininePlural,
            },
            neuter: {
              singular: neuterSingular,
              plural: neuterPlural,
            },
          });
        }
      }
    } catch (error) {
      console.error('Error extracting adjective table data:', error);
    }

    return data;
  }
}
