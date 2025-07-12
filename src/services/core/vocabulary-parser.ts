import fs from 'fs';
import path from 'path';
import { ParsedEntry, ParseResult } from '@/src/types/vocabulary';
import { EntryParser } from '../vocabulary/entry-parser';

export class VocabularyParser {
  private static readonly VOCABULARY_FILE_PATH = path.join(process.cwd(), 'public', '1400.txt');

  static async parseVocabularyFile(): Promise<ParseResult> {
    try {
      const content = fs.readFileSync(this.VOCABULARY_FILE_PATH, 'utf-8');
      const combinedContent = this.combineMultiLineEntries(content);
      return this.parseContent(combinedContent);
    } catch (error) {
      throw new Error(`Failed to parse vocabulary file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static combineMultiLineEntries(content: string): string {
    const lines = content.split('\n');
    const combinedLines: string[] = [];
    let currentEntry = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

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

      if (trimmedLine.match(/^\d+\./)) {
        if (currentEntry) {
          combinedLines.push(currentEntry);
        }
        currentEntry = trimmedLine;
      } else if (currentEntry) {
        currentEntry += ' ' + trimmedLine;
      } else {
        combinedLines.push(trimmedLine);
      }
    }

    if (currentEntry) {
      combinedLines.push(currentEntry);
    }

    return combinedLines.join('\n');
  }

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

      if (this.isSectionHeader(trimmedLine)) {
        currentSection = trimmedLine;
        currentSubsection = '';
        isInDeponentSection = false;
        continue;
      }

      if (this.isSubsectionHeader(trimmedLine)) {
        currentSubsection = trimmedLine;
        continue;
      }

      if (trimmedLine.includes('(Deponents italicized)')) {
        isInDeponentSection = true;
        continue;
      }

      if (this.isEntryStart(trimmedLine)) {
        const entry = EntryParser.parseEntry(trimmedLine, currentSection, currentSubsection);
        if (entry) {
          if (!sections[currentSection]) {
            sections[currentSection] = [];
          }

          if (isInDeponentSection && entry.wordType === 'verb') {
            entry.isDeponent = true;
          }

          sections[currentSection].push(entry);
          totalEntries++;

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

  private static isSectionHeader(line: string): boolean {
    return (
      /^(Nouns:|Verbs:|Irregular Verbs|Adverbs|Prepositions|Pronouns|Conjunctions|Interjections|Enclitic|Numbers)/.test(
        line
      ) ||
      line.includes('Adjectives') ||
      /^\d+(st|nd|rd|th)\s+Conjugation\s*\(\d+\)$/.test(line)
    );
  }

  private static isSubsectionHeader(line: string): boolean {
    // Handle declension subsections for nouns: "1st Declension (50)"
    if (/^\d+(st|nd|rd|th)\s+Declension(\s+Nouns)?\s*\(\d+\)$/.test(line)) {
      return true;
    }

    // Handle "General" subsection (though this may not be used in current structure)
    if (line.trim() === 'General') {
      return true;
    }

    return false;
  }

  private static isEntryStart(line: string): boolean {
    return line.match(/^\d+\./) !== null;
  }
}
