import { ParsedEntry } from '@/src/types/vocabulary';

export class NounParser {
  /**
   * Parse a noun entry from the vocabulary file
   */
  static parseNounEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match) return null;

    const [, idStr, content] = match;
    const id = parseInt(idStr);

    // Split by colon to separate word info from translation
    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const wordInfo = content.substring(0, colonIndex).trim();
    const translation = content.substring(colonIndex + 1).trim();

    // Extract word form (first part before comma)
    const firstCommaIndex = wordInfo.indexOf(',');
    const wordForm = firstCommaIndex > 0 ? wordInfo.substring(0, firstCommaIndex).trim() : wordInfo.trim();

    // Extract alternate form (handle different noun patterns)
    const alternateForm = this.extractAlternateForm(wordInfo);

    // Extract gender
    const gender = this.extractGender(wordInfo);

    // Determine declension class
    const declensionClass = this.getDeclensionClass(wordInfo, section, subsection);

    return {
      id,
      wordForm,
      alternateForm,
      grammaticalInfo: wordInfo,
      translation,
      wordType: 'noun',
      gender,
      declensionClass,
      section,
      subsection,
      originalText: line,
    };
  }

  /**
   * Extract alternate form from noun grammatical info
   */
  private static extractAlternateForm(grammaticalInfo: string): string | undefined {
    // Pattern: "forma, -ae f" or "forma, -ae OR formae f"
    const orMatch = grammaticalInfo.match(/,\s*([^,\s]+)\s+OR\s+([^,\s]+)/);
    if (orMatch) {
      // Handle "OR" pattern - return the alternative after OR
      return orMatch[2];
    }

    // Pattern for parenthetical alternatives: "domus, -i (also 4th declension: domus, -us)"
    const parentheticalMatch = grammaticalInfo.match(/\(also[^:]*:\s*([^,\s]+),\s*([^)]+)\)/);
    if (parentheticalMatch) {
      return parentheticalMatch[1]; // Return the alternate word form
    }

    return undefined;
  }

  /**
   * Extract gender from grammatical info
   */
  private static extractGender(grammaticalInfo: string): string | undefined {
    // Look for gender markers: m, f, n at the end
    const genderMatch = grammaticalInfo.match(/\b([mfn])\s*$/);
    if (genderMatch) {
      const genderCode = genderMatch[1];
      switch (genderCode) {
        case 'm':
          return 'masculine';
        case 'f':
          return 'feminine';
        case 'n':
          return 'neuter';
      }
    }

    return undefined;
  }

  /**
   * Determine declension class from grammatical info and section
   */
  private static getDeclensionClass(grammaticalInfo: string, section: string, subsection?: string): string | undefined {
    // First check if subsection explicitly mentions declension
    if (subsection) {
      const declensionMatch = subsection.match(/(\d+)(st|nd|rd|th)\s+Declension/);
      if (declensionMatch) {
        return `${declensionMatch[1]}${declensionMatch[2]}`;
      }
    }

    // Check section header
    const sectionDeclensionMatch = section.match(/(\d+)(st|nd|rd|th)\s+Declension/);
    if (sectionDeclensionMatch) {
      return `${sectionDeclensionMatch[1]}${sectionDeclensionMatch[2]}`;
    }

    // Infer from grammatical patterns
    if (grammaticalInfo.includes('-ae')) return '1st';
    if (grammaticalInfo.includes('-i') && !grammaticalInfo.includes('-us')) return '2nd';
    if (grammaticalInfo.includes('-us') && grammaticalInfo.includes('-i')) return '2nd';
    if (grammaticalInfo.includes('-is')) return '3rd';
    if (grammaticalInfo.includes('-us') && grammaticalInfo.includes('-us')) return '4th';
    if (grammaticalInfo.includes('-ei')) return '5th';

    return undefined;
  }

  /**
   * Check if a line represents a noun entry
   */
  static isNounEntry(section: string): boolean {
    return section.includes('Nouns') || section.includes('Declension');
  }

  /**
   * Extract all noun-specific information from grammatical info
   */
  static extractNounInfo(grammaticalInfo: string) {
    return {
      gender: this.extractGender(grammaticalInfo),
      alternateForm: this.extractAlternateForm(grammaticalInfo),
      declensionClass: this.getDeclensionClass(grammaticalInfo, '', ''),
    };
  }
}
