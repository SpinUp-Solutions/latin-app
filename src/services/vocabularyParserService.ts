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

  private static combineMultiLineEntries(content: string): string {
    const lines = content.split('\n');
    const combinedLines: string[] = [];
    let currentEntry = '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (this.isHeaderLine(trimmedLine)) {
        if (currentEntry) {
          combinedLines.push(currentEntry);
          currentEntry = '';
        }

        if (trimmedLine) {
          combinedLines.push(trimmedLine);
        }
        continue;
      }

      if (this.isEntryStart(trimmedLine)) {
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
    const lines = content.split('\n');
    const sections: Record<string, ParsedEntry[]> = {};
    const summary: Record<string, number> = {};

    let currentSection = '';
    let currentSubsection = '';
    let totalEntries = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Check for section headers (Nouns, Verbs, Adjectives, etc.)
      if (this.isSectionHeader(trimmedLine)) {
        currentSection = trimmedLine;
        currentSubsection = '';
        continue;
      }

      // Handle declension subsection headers (only within Nouns sections)
      if (currentSection.startsWith('Nouns:') && this.isDeclensionSubsection(trimmedLine)) {
        currentSubsection = trimmedLine;
        continue;
      }

      // Only parse numbered entries if we're in a Nouns section
      if (currentSection.startsWith('Nouns:') && trimmedLine.match(/^\d+\./)) {
        const entry = this.parseEntry(trimmedLine, currentSection, currentSubsection);

        if (entry) {
          const sectionKey = currentSubsection || currentSection;
          if (!sections[sectionKey]) {
            sections[sectionKey] = [];
          }
          sections[sectionKey].push(entry);
          totalEntries++;

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

  private static parseNounEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s*([^:]+):\s*(.+)$/);
    if (!match) return null;

    const [, id, leftPart, translation] = match;
    const parts = leftPart.split(',').map(part => part.trim());
    const wordForm = parts[0];
    const grammaticalInfo = parts.slice(1).join(', ');

    return {
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
  }

  private static getDeclensionClass(grammaticalInfo: string, section: string, subsection: string): string | undefined {
    // Check subsection first (more specific), then section
    const textToCheck = subsection || section;

    const declensionMatch = textToCheck.match(/(\d+)(st|nd|rd|th)\s+Declension/);
    return declensionMatch ? `${declensionMatch[1]}${declensionMatch[2]}` : undefined;
  }

  private static extractGender(grammaticalInfo: string): string | undefined {
    const genderPatterns = [
      { pattern: /\s+f[:)\s]|\sf$/, gender: 'f' },
      { pattern: /\s+m[:)\s]|\sm$/, gender: 'm' },
      { pattern: /\s+n[:)\s]|\sn$/, gender: 'n' },
      { pattern: /\s+m\/f[:)\s]|\sm\/f$/, gender: 'm/f' },
    ];

    for (const { pattern, gender } of genderPatterns) {
      if (pattern.test(grammaticalInfo)) {
        return gender;
      }
    }

    return undefined;
  }
}
