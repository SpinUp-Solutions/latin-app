import { ParsedEntry, ParseResult } from '@/src/types/vocabulary';
import { VocabularyParser } from './core/vocabulary-parser';
import { WordFilters } from './core/word-filters';
import { EntryParser } from './vocabulary/entry-parser';

export class VocabularyParserService {
  /**
   * Main entry point to parse the vocabulary file
   */
  static async parseVocabularyFile(): Promise<ParseResult> {
    return await VocabularyParser.parseVocabularyFile();
  }

  // === FILTERING METHODS ===
  // Delegate to WordFilters for consistency

  static filterFirstDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterFirstDeclensionNouns(parseResult);
  }

  static filterSecondDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterSecondDeclensionNouns(parseResult);
  }

  static filterThirdDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterThirdDeclensionNouns(parseResult);
  }

  static filterFourthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterFourthDeclensionNouns(parseResult);
  }

  static filterFifthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterFifthDeclensionNouns(parseResult);
  }

  static filterAllNouns(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterAllNouns(parseResult);
  }

  static filterVerbs(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterVerbs(parseResult);
  }

  static filterAdjectives(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.filterAdjectives(parseResult);
  }

  static filterByWordType(parseResult: ParseResult, wordType: ParsedEntry['wordType']): ParsedEntry[] {
    return WordFilters.filterByWordType(parseResult, wordType);
  }

  static getAllEntries(parseResult: ParseResult): ParsedEntry[] {
    return WordFilters.getAllEntries(parseResult);
  }

  // === PARSING UTILITIES ===
  // Expose entry parsing functionality

  /**
   * Parse a single entry line
   */
  static parseEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    return EntryParser.parseEntry(line, section, subsection);
  }

  /**
   * Check if a line is a valid entry
   */
  static isValidEntry(line: string): boolean {
    return EntryParser.isValidEntry(line);
  }

  /**
   * Extract entry ID from line
   */
  static extractEntryId(line: string): number | null {
    return EntryParser.extractEntryId(line);
  }
}
