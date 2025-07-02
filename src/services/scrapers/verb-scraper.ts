import { BrowserContext, Locator } from 'playwright';
import { WiktionaryData, ConjugationTable, PersonForms } from '@/src/types/vocabulary';
import { BaseScraper } from './base-scraper';

export class VerbScraper extends BaseScraper {
  /**
   * Scrape verb-specific data including conjugation table
   */
  static async scrapeVerb(word: string, context: BrowserContext): Promise<WiktionaryData | null> {
    const result = await this.scrapeWiktionary(word, context);
    if (!result) return null;

    // Find Latin section and verb section
    const page = await context.newPage();
    try {
      await page.goto(`https://en.wiktionary.org/wiki/${word}`, { waitUntil: 'networkidle' });

      const latinDiv = page.locator('div.mw-heading.mw-heading2:has(> h2#Latin)').first();
      if (await latinDiv.count()) {
        const verbSection = this.findVerbSection(latinDiv);
        if (await verbSection.count()) {
          await this.extractConjugationTable(verbSection, result);
        }
      }

      return result;
    } finally {
      await page.close();
    }
  }

  /**
   * Extract conjugation table for verbs
   */
  private static async extractConjugationTable(verbDiv: Locator, result: WiktionaryData): Promise<void> {
    try {
      // Strategy: Look for tables with inflection classes, but bound the search to stop at the next language section
      // This prevents picking up conjugation tables from other languages

      // First, try to find the table within reasonable bounds (before next h2 language section)
      let table = verbDiv
        .locator(
          'xpath=following-sibling::*[not(self::div[contains(@class,"mw-heading2")])]//table[contains(@class,"inflection")]'
        )
        .first();

      if (!(await table.count())) {
        // Fallback: look for any table with conjugation-related classes (but still bounded)
        table = verbDiv
          .locator(
            'xpath=following-sibling::*[not(self::div[contains(@class,"mw-heading2")])]//table[contains(@class,"wikitable") or contains(@class,"prettytable") or contains(@class,"verb")]'
          )
          .first();
      }

      if (!(await table.count())) {
        // Final fallback: look for the first table after verb section (bounded by next language)
        table = verbDiv
          .locator('xpath=following-sibling::*[not(self::div[contains(@class,"mw-heading2")])]//table')
          .first();
      }

      if (await table.count()) {
        result.conjugationTable = await this.extractConjugationData(table);
      }
    } catch (error) {
      // Silently fail for optional data
    }
  }

  /**
   * Extract conjugation data from table
   */
  private static async extractConjugationData(table: Locator): Promise<ConjugationTable> {
    const conjugationTable: ConjugationTable = {};

    try {
      const rows = await table.locator('tr').all();

      let currentMood = '';
      let currentVoice = '';
      let currentTense = '';

      for (const row of rows) {
        const cells = await row.locator('th, td').all();
        if (cells.length === 0) continue;

        const firstCellText = await cells[0].textContent();
        if (!firstCellText) continue;

        const cleanText = firstCellText.trim().toLowerCase();

        // Detect mood sections
        if (cleanText.includes('indicative')) {
          currentMood = 'indicative';
          continue;
        } else if (cleanText.includes('subjunctive')) {
          currentMood = 'subjunctive';
          continue;
        } else if (cleanText.includes('imperative')) {
          currentMood = 'imperative';
          continue;
        } else if (cleanText.includes('non-finite')) {
          currentMood = 'nonFinite';
          continue;
        } else if (cleanText.includes('verbal nouns')) {
          currentMood = 'verbalNouns';
          continue;
        }

        // Detect voice (only for indicative/subjunctive)
        if (cleanText.includes('active') && (currentMood === 'indicative' || currentMood === 'subjunctive')) {
          currentVoice = 'active';
          continue;
        } else if (cleanText.includes('passive') && (currentMood === 'indicative' || currentMood === 'subjunctive')) {
          currentVoice = 'passive';
          continue;
        }

        // Detect tense
        if (cleanText.includes('present')) {
          currentTense = 'present';
        } else if (cleanText.includes('imperfect')) {
          currentTense = 'imperfect';
        } else if (cleanText.includes('future') && !cleanText.includes('perfect')) {
          currentTense = 'future';
        } else if (
          cleanText.includes('perfect') &&
          !cleanText.includes('pluperfect') &&
          !cleanText.includes('future')
        ) {
          currentTense = 'perfect';
        } else if (cleanText.includes('pluperfect')) {
          currentTense = 'pluperfect';
        } else if (cleanText.includes('future perfect')) {
          currentTense = 'futurePerfect';
        }

        // Extract verb forms if this row has person/number data
        if (
          cells.length >= 7 &&
          currentMood &&
          (currentMood === 'indicative' || currentMood === 'subjunctive') &&
          currentVoice &&
          currentTense
        ) {
          const personForms = await this.extractPersonFormsFromRow(cells);
          this.setPersonForms(conjugationTable, currentMood, currentVoice, currentTense, personForms);
        }
      }
    } catch (error) {
      console.error('Error extracting conjugation data:', error);
    }

    return conjugationTable;
  }

  /**
   * Extract person forms from a table row
   */
  private static async extractPersonFormsFromRow(cells: Locator[]): Promise<PersonForms> {
    // Expecting: [mood/tense cell, 1st sing, 2nd sing, 3rd sing, 1st plur, 2nd plur, 3rd plur]
    const personForms: PersonForms = {
      singular: {},
      plural: {},
    };

    if (cells.length >= 7) {
      const forms = await Promise.all(cells.slice(1, 7).map(cell => this.extractMultipleForms(cell)));

      personForms.singular.first = forms[0];
      personForms.singular.second = forms[1];
      personForms.singular.third = forms[2];
      personForms.plural.first = forms[3];
      personForms.plural.second = forms[4];
      personForms.plural.third = forms[5];
    }

    return personForms;
  }

  /**
   * Set person forms in conjugation table structure
   */
  private static setPersonForms(
    conjugationTable: ConjugationTable,
    mood: string,
    voice: string,
    tense: string,
    personForms: PersonForms
  ): void {
    if (!(conjugationTable as any)[mood]) {
      (conjugationTable as any)[mood] = {};
    }
    if (!(conjugationTable as any)[mood][voice]) {
      (conjugationTable as any)[mood][voice] = {};
    }
    (conjugationTable as any)[mood][voice][tense] = personForms;
  }
}
