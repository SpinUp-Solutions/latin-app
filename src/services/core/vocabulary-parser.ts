import fs from 'fs';
import path from 'path';
import { ParsedEntry, ParseResult } from '@/src/types/vocabulary';
import { EntryParser } from '../vocabulary/entry-parser';

export class VocabularyParser {
  private static readonly VOCABULARY_FILE_PATH = path.join(process.cwd(), 'public', '1400.txt');

  /**
   * Main entry point to parse the vocabulary file
   */
  static async parseVocabularyFile(): Promise<ParseResult> {
    try {
      const content = fs.readFileSync(this.VOCABULARY_FILE_PATH, 'utf-8');
      const combinedContent = this.combineMultiLineEntries(content);
      return this.parseContent(combinedContent);
    } catch (error) {
      throw new Error(`Failed to parse vocabulary file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Combine multi-line entries into single lines for easier parsing
   */
  private static combineMultiLineEntries(content: string): string {
    const lines = content.split('\n');
    const combinedLines: string[] = [];
    let currentEntry = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      // If this is a section header or empty line, end current entry
      if (
        !trimmedLine ||
        trimmedLine.match(
          /^(Nouns:|Verbs:|Irregular Verbs|Adverbs|Prepositions|Pronouns|Conjunctions|Interjections|Enclitic|Numbers)/
        ) ||
        trimmedLine.match(/^\d+(st|nd|rd|th)\s+(Declension|Conjugation)/) ||
        trimmedLine.match(/^(1st\/2nd Declension|3rd Declension).*Adjectives/) ||
        trimmedLine.includes('(Deponents italicized)')
      ) {
        if (currentEntry) {
          combinedLines.push(currentEntry);
          currentEntry = '';
        }

        if (trimmedLine) {
          combinedLines.push(trimmedLine);
        }
        continue;
      }

      // If this starts a new numbered entry, save previous and start new
      if (trimmedLine.match(/^\d+\./)) {
        if (currentEntry) {
          combinedLines.push(currentEntry);
        }
        currentEntry = trimmedLine;
      } else if (currentEntry) {
        // Continue building current entry
        currentEntry += ' ' + trimmedLine;
      } else {
        // Line that doesn't belong to an entry
        combinedLines.push(trimmedLine);
      }
    }

    // Don't forget the last entry
    if (currentEntry) {
      combinedLines.push(currentEntry);
    }

    return combinedLines.join('\n');
  }

  /**
   * Parse the combined content into structured data
   */
  private static parseContent(content: string): ParseResult {
    const lines = content.split('\n');
    const sections: Record<string, ParsedEntry[]> = {};
    const summary: Record<string, number> = {};

    let currentSection = '';
    let currentSubsection = '';
    let totalEntries = 0;
    let isInDeponentSection = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Check for main section headers
      if (this.isSectionHeader(trimmedLine)) {
        currentSection = trimmedLine;
        currentSubsection = '';
        isInDeponentSection = false;
        continue;
      }

      // Check for subsection headers (like "2nd Declension (110)")
      if (this.isDeclensionSubsection(trimmedLine)) {
        currentSubsection = trimmedLine;
        continue;
      }

      // Check for deponent marker
      if (trimmedLine.includes('(Deponents italicized)')) {
        isInDeponentSection = true;
        continue;
      }

      // Parse individual entries
      if (this.isEntryStart(trimmedLine)) {
        const entry = EntryParser.parseEntry(trimmedLine, currentSection, currentSubsection);
        if (entry) {
          if (!sections[currentSection]) {
            sections[currentSection] = [];
          }

          // Set deponent flag if in deponent section
          if (isInDeponentSection && entry.wordType === 'verb') {
            entry.isDeponent = true;
          }

          sections[currentSection].push(entry);
          totalEntries++;

          // Update summary
          const key = `${entry.wordType}s`;
          summary[key] = (summary[key] || 0) + 1;
        }
      }
    }

    return {
      sections,
      summary,
      totalEntries,
    };
  }

  // === UTILITY METHODS ===

  private static isSectionHeader(line: string): boolean {
    return (
      /^(Nouns:|Verbs:|Irregular Verbs|Adverbs|Prepositions|Pronouns|Conjunctions|Interjections|Enclitic|Numbers)/.test(
        line
      ) || line.includes('Adjectives')
    );
  }

  private static isDeclensionSubsection(line: string): boolean {
    return /^\d+(st|nd|rd|th)\s+Declension(\s+Nouns)?\s*\(\d+\)$/.test(line);
  }

  private static isEntryStart(line: string): boolean {
    return line.match(/^\d+\./) !== null;
  }
}
