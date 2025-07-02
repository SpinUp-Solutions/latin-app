import { ParsedEntry } from '@/src/types/vocabulary';
import { NounParser } from './noun-parser';
import { VerbParser } from './verb-parser';

export class EntryParser {
  /**
   * Parse a single entry line into structured data
   * Delegates to specialized parsers based on word type
   */
  static parseEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    // Determine word type based on section
    const wordType = this.determineWordType(section);
    if (!wordType) return null;

    // Delegate to specialized parsers
    switch (wordType) {
      case 'noun':
        return NounParser.parseNounEntry(line, section, subsection);

      case 'verb':
        return VerbParser.parseVerbEntry(line, section, subsection);

      case 'adjective':
      case 'adverb':
      case 'preposition':
      case 'pronoun':
      case 'conjunction':
      case 'interjection':
        return this.parseSimpleEntry(line, section, subsection, wordType);

      default:
        return this.parseGenericEntry(line, section, subsection);
    }
  }

  /**
   * Determine word type from section name
   */
  private static determineWordType(section: string): ParsedEntry['wordType'] | null {
    if (section.includes('Nouns') || section.includes('Declension')) return 'noun';
    if (section.includes('Verbs') || section.includes('Conjugation')) return 'verb';
    if (section.includes('Adjectives')) return 'adjective';
    if (section.includes('Adverbs')) return 'adverb';
    if (section.includes('Prepositions')) return 'preposition';
    if (section.includes('Pronouns')) return 'pronoun';
    if (section.includes('Conjunctions')) return 'conjunction';
    if (section.includes('Interjections')) return 'interjection';
    return null;
  }

  /**
   * Parse simple entries (adverbs, prepositions, etc.)
   */
  private static parseSimpleEntry(
    line: string,
    section: string,
    subsection: string,
    wordType: ParsedEntry['wordType']
  ): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match) return null;

    const [, idStr, content] = match;
    const id = parseInt(idStr);

    // Split by colon to separate word info from translation
    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const wordInfo = content.substring(0, colonIndex).trim();
    const translation = content.substring(colonIndex + 1).trim();

    // Extract word form (first part before comma or space)
    const wordForm = this.extractWordForm(wordInfo);

    return {
      id,
      wordForm,
      grammaticalInfo: wordInfo,
      translation,
      wordType,
      section,
      subsection,
      originalText: line,
    };
  }

  /**
   * Parse generic entry when word type is unknown
   */
  private static parseGenericEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match) return null;

    const [, idStr, content] = match;
    const id = parseInt(idStr);

    // Split by colon to separate word info from translation
    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const wordInfo = content.substring(0, colonIndex).trim();
    const translation = content.substring(colonIndex + 1).trim();

    const wordForm = this.extractWordForm(wordInfo);

    // Return null for unknown word types instead of using invalid type
    return null;
  }

  /**
   * Extract the main word form from grammatical info
   */
  private static extractWordForm(wordInfo: string): string {
    // Extract first word (before comma or space)
    const parts = wordInfo.split(/[,\s]/);
    return parts[0].trim();
  }

  /**
   * Check if a line represents a valid entry
   */
  static isValidEntry(line: string): boolean {
    return line.match(/^\d+\./) !== null;
  }

  /**
   * Extract entry ID from line
   */
  static extractEntryId(line: string): number | null {
    const match = line.match(/^(\d+)\./);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Split entry content into word info and translation
   */
  static splitEntryContent(content: string): { wordInfo: string; translation: string } | null {
    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    return {
      wordInfo: content.substring(0, colonIndex).trim(),
      translation: content.substring(colonIndex + 1).trim(),
    };
  }
}
