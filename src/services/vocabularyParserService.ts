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
      line.match(
        /^(Nouns:|Verbs:|Irregular Verbs|Adverbs|Prepositions|Pronouns|Conjunctions|Interjections|Enclitic|Numbers)/
      ) !== null ||
      line.match(/^\d+(st|nd|rd|th)\s+(Declension|Conjugation)/) !== null ||
      line.match(/^(1st\/2nd Declension|3rd Declension).*Adjectives/) !== null ||
      line.includes('(Deponents italicized)')
    );
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

      if (trimmedLine.startsWith('Nouns:')) {
        currentSection = trimmedLine;
        currentSubsection = '';
        continue;
      }

      // Handle subsection headers like "2nd Declension (110)", "3rd Declension (144)", etc.
      if (trimmedLine.match(/^\d+(st|nd|rd|th)\s+Declension\s*\(\d+\)$/)) {
        currentSubsection = trimmedLine;
        continue;
      }

      if (trimmedLine.match(/^\d+\./)) {
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
    // Check subsection first (more specific) - for entries after the first section
    if (subsection) {
      const declensionPatterns = [
        { pattern: /1st Declension/, class: '1st' },
        { pattern: /2nd Declension/, class: '2nd' },
        { pattern: /3rd Declension/, class: '3rd' },
        { pattern: /4th Declension/, class: '4th' },
        { pattern: /5th Declension/, class: '5th' },
      ];

      for (const { pattern, class: declClass } of declensionPatterns) {
        if (pattern.test(subsection)) {
          return declClass;
        }
      }
    }

    // Check section for the initial declension (e.g., "Nouns: 1st Declension (82)")
    if (section.includes('1st Declension')) return '1st';
    if (section.includes('2nd Declension')) return '2nd';
    if (section.includes('3rd Declension')) return '3rd';
    if (section.includes('4th Declension')) return '4th';
    if (section.includes('5th Declension')) return '5th';

    return undefined;
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
