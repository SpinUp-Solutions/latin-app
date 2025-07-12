import { ParsedEntry } from '@/src/types/vocabulary';

export class NounParser {
  static parseNounEntry(line: string, section: string, subsection: string): ParsedEntry | null {
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (!match) return null;

    const [, idStr, content] = match;
    const id = parseInt(idStr);

    const colonIndex = content.lastIndexOf(':');
    if (colonIndex === -1) return null;

    const wordInfo = content.substring(0, colonIndex).trim();
    const translation = content.substring(colonIndex + 1).trim();

    const firstCommaIndex = wordInfo.indexOf(',');
    const wordPart = firstCommaIndex > 0 ? wordInfo.substring(0, firstCommaIndex).trim() : wordInfo.trim();

    // Handle alternative forms separated by "/"
    const { wordForm, alternateForm } = this.extractWordAndAlternateForm(wordPart);

    const gender = this.extractGender(wordInfo);

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

  private static extractWordAndAlternateForm(wordPart: string): { wordForm: string; alternateForm?: string } {
    // Check for "/" pattern first (e.g., "conjunx/conjux")
    if (wordPart.includes('/')) {
      const [mainForm, altForm] = wordPart.split('/').map(w => w.trim());
      return {
        wordForm: mainForm,
        alternateForm: altForm,
      };
    }

    // Fallback to existing alternative form patterns
    const alternateForm = this.extractAlternateForm(wordPart);
    return {
      wordForm: wordPart,
      alternateForm,
    };
  }

  private static extractAlternateForm(grammaticalInfo: string): string | undefined {
    const orMatch = grammaticalInfo.match(/,\s*([^,\s]+)\s+OR\s+([^,\s]+)/);
    if (orMatch) {
      return orMatch[2];
    }

    const parentheticalMatch = grammaticalInfo.match(/\(also[^:]*:\s*([^,\s]+),\s*([^)]+)\)/);
    if (parentheticalMatch) {
      return parentheticalMatch[1];
    }

    return undefined;
  }

  private static extractGender(grammaticalInfo: string): string | undefined {
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

  private static getDeclensionClass(grammaticalInfo: string, section: string, subsection?: string): string | undefined {
    if (subsection) {
      const declensionMatch = subsection.match(/(\d+)(st|nd|rd|th)\s+Declension/);
      if (declensionMatch) {
        return `${declensionMatch[1]}${declensionMatch[2]}`;
      }
    }

    const sectionDeclensionMatch = section.match(/(\d+)(st|nd|rd|th)\s+Declension/);
    if (sectionDeclensionMatch) {
      return `${sectionDeclensionMatch[1]}${sectionDeclensionMatch[2]}`;
    }

    if (grammaticalInfo.includes('-ae')) return '1st';
    if (grammaticalInfo.includes('-i') && !grammaticalInfo.includes('-us')) return '2nd';
    if (grammaticalInfo.includes('-us') && grammaticalInfo.includes('-i')) return '2nd';
    if (grammaticalInfo.includes('-is')) return '3rd';
    if (grammaticalInfo.includes('-us') && grammaticalInfo.includes('-us')) return '4th';
    if (grammaticalInfo.includes('-ei')) return '5th';

    return undefined;
  }

  static isNounEntry(section: string): boolean {
    return section.includes('Nouns') || section.includes('Declension');
  }

  static extractNounInfo(grammaticalInfo: string) {
    return {
      gender: this.extractGender(grammaticalInfo),
      alternateForm: this.extractAlternateForm(grammaticalInfo),
      declensionClass: this.getDeclensionClass(grammaticalInfo, '', ''),
    };
  }
}
