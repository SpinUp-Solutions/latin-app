import fs from 'fs';
import path from 'path';
import { ParsedEntry, ParseResult } from '@/src/types/vocabulary';

export class VocabularyParserService {
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

  static filterFirstDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '1st');
  }

  static filterSecondDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '2nd');
  }

  static filterThirdDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '3rd');
  }

  static filterFourthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '4th');
  }

  static filterFifthDeclensionNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'noun' && entry.declensionClass === '5th');
  }

  /**
   * Filter entries to get all nouns (any declension)
   */
  static filterAllNouns(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'noun');
  }

  /**
   * Filter entries to get all verbs
   */
  static filterVerbs(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'verb');
  }

  /**
   * Filter entries to get all adjectives
   */
  static filterAdjectives(parseResult: ParseResult): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === 'adjective');
  }

  /**
   * Filter entries by word type
   */
  static filterByWordType(parseResult: ParseResult, wordType: ParsedEntry['wordType']): ParsedEntry[] {
    const allEntries = Object.values(parseResult.sections).flat();
    return allEntries.filter(entry => entry.wordType === wordType);
  }

  /**
   * Get all entries flattened from all sections
   */
  static getAllEntries(parseResult: ParseResult): ParsedEntry[] {
    return Object.values(parseResult.sections).flat();
  }

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

  private static isHeaderLine(line: string): boolean {
    return (
      !line ||
      this.isSectionHeader(line) ||
      this.isDeclensionSubsection(line) ||
      line.includes('(Deponents italicized)')
    );
  }

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

  private static parseContent(content: string): ParseResult {
    // First, combine multi-line entries
    const combinedContent = this.combineMultiLineEntries(content);
    const lines = combinedContent.split('\n');

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
      if (trimmedLine.startsWith('Nouns:')) {
        currentSection = trimmedLine;
        currentSubsection = '';
        isInDeponentSection = false;
        continue;
      }
      if (trimmedLine.startsWith('Verbs:')) {
        currentSection = trimmedLine;
        currentSubsection = '';
        isInDeponentSection = false;
        continue;
      }
      if (
        trimmedLine.match(
          /^(Irregular Verbs|Adverbs|Prepositions|Pronouns|Conjunctions|Interjections|Enclitic|Numbers)/
        )
      ) {
        currentSection = trimmedLine;
        currentSubsection = '';
        isInDeponentSection = false;
        continue;
      }

      // Check for subsection headers (like "2nd Declension (110)")
      if (trimmedLine.match(/^\d+(st|nd|rd|th)\s+Declension\s*\(\d+\)$/)) {
        currentSubsection = trimmedLine;
        continue;
      }

      // Check for specific noun declension headers (like "3rd Declension Nouns (181)")
      if (trimmedLine.match(/^\d+(st|nd|rd|th)\s+Declension\s+Nouns\s*\(\d+\)$/)) {
        currentSubsection = trimmedLine;
        continue;
      }

      // Check for conjugation headers (like "2nd Conjugation (51)")
      if (trimmedLine.match(/^\d+(st|nd|rd|th)\s+Conjugation\s*\(\d+\)$/)) {
        currentSubsection = trimmedLine;
        continue;
      }

      // Check for adjective subsection headers
      if (trimmedLine.match(/^(1st\/2nd Declension|3rd Declension).*Adjectives/)) {
        currentSection = trimmedLine;
        currentSubsection = '';
        continue;
      }

      // Check for deponent indicator
      if (trimmedLine.includes('(Deponents italicized)')) {
        isInDeponentSection = true;
        continue;
      }

      // Parse numbered entries
      if (trimmedLine.match(/^\d+\./)) {
        let entry: ParsedEntry | null = null;

        // Determine entry type based on current section
        if (currentSection.startsWith('Nouns')) {
          entry = this.parseNounEntry(trimmedLine, currentSection, currentSubsection);
        } else if (currentSection.startsWith('Verbs') || currentSection.startsWith('Irregular Verbs')) {
          entry = this.parseVerbEntry(trimmedLine, currentSection, currentSubsection, isInDeponentSection);
        } else if (currentSection.includes('Adjectives')) {
          entry = this.parseAdjectiveEntry(trimmedLine, currentSection, currentSubsection);
        } else if (currentSection.startsWith('Adverbs')) {
          entry = this.parseSimpleEntry(trimmedLine, currentSection, currentSubsection, 'adverb');
        } else if (currentSection.startsWith('Prepositions')) {
          entry = this.parseSimpleEntry(trimmedLine, currentSection, currentSubsection, 'preposition');
        } else if (currentSection.startsWith('Pronouns')) {
          entry = this.parseSimpleEntry(trimmedLine, currentSection, currentSubsection, 'pronoun');
        } else if (currentSection.startsWith('Conjunctions')) {
          entry = this.parseSimpleEntry(trimmedLine, currentSection, currentSubsection, 'conjunction');
        } else if (currentSection.startsWith('Interjections')) {
          entry = this.parseSimpleEntry(trimmedLine, currentSection, currentSubsection, 'interjection');
        } else if (currentSection.startsWith('Enclitic')) {
          entry = this.parseSimpleEntry(trimmedLine, currentSection, currentSubsection, 'enclitic');
        } else if (currentSection.startsWith('Numbers')) {
          entry = this.parseSimpleEntry(trimmedLine, currentSection, currentSubsection, 'number');
        }

        if (entry) {
          const sectionKey = currentSubsection || currentSection;
          if (!sections[sectionKey]) {
            sections[sectionKey] = [];
          }
          sections[sectionKey].push(entry);
          totalEntries++;

          // Update summary
          const summaryKey = `${currentSection} - ${currentSubsection || 'General'}`;
          summary[summaryKey] = (summary[summaryKey] || 0) + 1;
        }
      }
    }

    return {
      totalEntries,
      sections,
      summary,
    };
  }

  private static parseEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    if (section.startsWith('Nouns')) {
      return this.parseNounEntry(line, section, subsection);
    }
    // Add other entry types as needed
    return null;
  }

  /**
   * Parse verb entries like "1. admiror, admirari, admiratus sum: to admire, wonder at, be surprised at"
   */
  private static parseVerbEntry(
    line: string,
    section: string,
    subsection: string,
    isDeponent: boolean = false
  ): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
    if (!match) return null;

    const [, id, leftPart, translation] = match;

    // Extract principal parts
    const parts = leftPart.split(',').map(part => part.trim());
    const wordForm = parts[0]; // First principal part
    const grammaticalInfo = leftPart; // All principal parts

    return {
      id: parseInt(id),
      originalText: line,
      wordForm,
      grammaticalInfo,
      translation: translation.trim(),
      section,
      subsection,
      wordType: 'verb',
      conjugationClass: this.getConjugationClass(subsection),
      isDeponent,
    };
  }

  /**
   * Parse adjective entries like "1. acerbus, -a, -um: bitter, harsh, sour, unripe, cruel, premature, rough"
   */
  private static parseAdjectiveEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
    if (!match) return null;

    const [, id, leftPart, translation] = match;

    // Extract word form and grammatical info
    const parts = leftPart.split(',').map(part => part.trim());
    const wordForm = parts[0];
    const grammaticalInfo = leftPart;

    return {
      id: parseInt(id),
      originalText: line,
      wordForm,
      grammaticalInfo,
      translation: translation.trim(),
      section,
      subsection,
      wordType: 'adjective',
      declensionClass: subsection.includes('3rd Declension') ? '3rd' : '1st/2nd',
    };
  }

  /**
   * Parse simple entries like adverbs, prepositions, etc.
   */
  private static parseSimpleEntry(
    line: string,
    section: string,
    subsection: string,
    wordType: ParsedEntry['wordType']
  ): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
    if (!match) return null;

    const [, id, leftPart, translation] = match;

    // For simple entries, the word form is usually the first word
    const wordForm = leftPart.split(/[,\s]+/)[0];
    const grammaticalInfo = leftPart;

    return {
      id: parseInt(id),
      originalText: line,
      wordForm,
      grammaticalInfo,
      translation: translation.trim(),
      section,
      subsection,
      wordType,
    };
  }

  /**
   * Helper function to determine conjugation class for verbs
   */
  private static getConjugationClass(section: string): string | undefined {
    if (section.includes('1st Conjugation')) return '1st';
    if (section.includes('2nd Conjugation')) return '2nd';
    if (section.includes('3rd Conjugation')) return '3rd';
    if (section.includes('4th Conjugation')) return '4th';
    return undefined;
  }

  private static parseNounEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
    if (!match) return null;

    const [, id, leftPart, translation] = match;
    const parts = leftPart.split(',').map(part => part.trim());

    // Handle alternative forms separated by "/" in the first part
    const firstPart = parts[0];
    let wordForm: string;
    let alternateForm: string | undefined;

    if (firstPart.includes('/')) {
      const wordParts = firstPart.split('/').map(part => part.trim());
      wordForm = wordParts[0]; // First form is the main word
      alternateForm = wordParts[1]; // Second form is the alternate
    } else {
      wordForm = firstPart;
    }

    const grammaticalInfo = parts.slice(1).join(', ');

    const entry: ParsedEntry = {
      id: parseInt(id),
      originalText: line,
      wordForm,
      grammaticalInfo,
      translation: translation.trim(),
      section,
      subsection,
      wordType: 'noun',
      declensionClass: this.getDeclensionClass(grammaticalInfo, section, subsection),
      gender: this.extractGender(grammaticalInfo),
    };

    // Only add alternateForm if it exists
    if (alternateForm) {
      entry.alternateForm = alternateForm;
    }

    return entry;
  }

  private static getDeclensionClass(grammaticalInfo: string, section: string, subsection?: string): string | undefined {
    // Check subsection first (more specific), then section
    const textToCheck = subsection || section;

    if (textToCheck.includes('1st Declension')) return '1st';
    if (textToCheck.includes('2nd Declension')) return '2nd';
    if (textToCheck.includes('3rd Declension')) return '3rd';
    if (textToCheck.includes('4th Declension')) return '4th';
    if (textToCheck.includes('5th Declension')) return '5th';
    return undefined;
  }

  private static extractGender(grammaticalInfo: string): string | undefined {
    if (grammaticalInfo.includes(' f:') || grammaticalInfo.includes(' f') || grammaticalInfo.endsWith(' f')) return 'f';
    if (grammaticalInfo.includes(' m:') || grammaticalInfo.includes(' m') || grammaticalInfo.endsWith(' m')) return 'm';
    if (grammaticalInfo.includes(' n:') || grammaticalInfo.includes(' n') || grammaticalInfo.endsWith(' n')) return 'n';
    if (grammaticalInfo.includes(' m/f:') || grammaticalInfo.includes(' m/f') || grammaticalInfo.endsWith(' m/f'))
      return 'm/f';
    return undefined;
  }
}
