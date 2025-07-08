import { BrowserContext, Locator } from 'playwright';
import { WiktionaryData, DeclensionData } from '@/src/types/vocabulary';
import { BaseScraper } from './base-scraper';

export class NounScraper extends BaseScraper {
  static async scrapeNoun(word: string, context: BrowserContext): Promise<WiktionaryData | null> {
    const result = await this.scrapeWiktionary(word, context, 'noun');
    if (!result) return null;

    const page = await context.newPage();
    try {
      await page.goto(`https://en.wiktionary.org/wiki/${word}`, { waitUntil: 'networkidle' });

      const latinDiv = page.locator('div.mw-heading.mw-heading2:has(> h2#Latin)').first();
      if (await latinDiv.count()) {
        await this.extractDeclensionTable(latinDiv, result);
      }

      return result;
    } finally {
      await page.close();
    }
  }

  private static async extractDeclensionTable(latinDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      const table = latinDiv.locator('xpath=following-sibling::*//table[contains(@class,"inflection")]').first();

      if (await table.count()) {
        result.declensionTable = await this.extractTableData(table);
      }
    } catch (error) {}
  }

  private static async extractTableData(table: Locator): Promise<DeclensionData[]> {
    const rows = await table.locator('tr').all();
    const data: DeclensionData[] = [];

    for (let i = 1; i < rows.length; i++) {
      const cells = await rows[i].locator('th, td').all();
      if (cells.length < 3) continue;

      const [caseCell, singularCell, pluralCell] = cells.slice(0, 3);

      const caseText = await caseCell.textContent();
      if (!caseText) continue;

      const singularForms = await this.extractMultipleForms(singularCell);

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
}
