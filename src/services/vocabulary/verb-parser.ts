import { ParsedEntry } from '@/src/types/vocabulary';

export class VerbParser {
  static parseVerbEntry(line: string, section: string, subsection: string): ParsedEntry | null {
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

    const principalParts = this.extractPrincipalParts(wordInfo);

    const conjugationClass = this.getConjugationClass(section);

    const isDeponent = this.isDeponentVerb(wordInfo);

    return {
      id,
      wordForm,
      alternateForm,
      grammaticalInfo: wordInfo,
      principalParts,
      translation,
      wordType: 'verb',
      conjugationClass,
      isDeponent,
      section,
      subsection,
      originalText: line,
    };
  }

  private static extractWordAndAlternateForm(wordPart: string): { wordForm: string; alternateForm?: string } {
    // Check for "/" pattern first (e.g., "amo/amabo")
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
    const parentheticalMatch = grammaticalInfo.match(/\(([^)]+variant[^)]*)\)/);
    if (parentheticalMatch) {
      const variantInfo = parentheticalMatch[1];
      const variantMatch = variantInfo.match(/variant of (\w+)/);
      if (variantMatch) {
        return variantMatch[1];
      }
    }

    return undefined;
  }

  private static extractPrincipalParts(grammaticalInfo: string): string[] {
    const parts: string[] = [];

    const rawParts = grammaticalInfo.split(',').map(part => part.trim());

    for (const part of rawParts) {
      const processedPart = this.processPrincipalPart(part);
      if (processedPart) {
        parts.push(processedPart);
      }
    }

    return parts;
  }

  private static processPrincipalPart(rawPart: string): string | null {
    let part = rawPart.trim();

    if (!part || part.length === 0) return null;

    if (part.startsWith('-')) {
      return part;
    }

    if (part.includes(' ')) {
      part = part.split(' ')[0];
    }

    return part;
  }

  static getFullPrincipalParts(wordForm: string, principalParts: string[]): string[] {
    const fullParts: string[] = [];
    const stem = this.getVerbStem(wordForm);

    for (const part of principalParts) {
      if (part.startsWith('-') && stem) {
        fullParts.push(stem + part);
      } else {
        fullParts.push(part);
      }
    }

    return fullParts;
  }

  private static getVerbStem(wordForm: string): string {
    if (wordForm.endsWith('or')) {
      return wordForm.slice(0, -2);
    } else if (wordForm.endsWith('o')) {
      return wordForm.slice(0, -1);
    }
    return wordForm;
  }

  private static getConjugationClass(section: string): string | undefined {
    // Check section for conjugation information
    if (section.includes('Verbs: 1st Conjugation')) {
      return '1st';
    }

    // Handle standalone conjugation sections: "2nd Conjugation (51)", "3rd Conjugation (155)", etc.
    const conjugationMatch = section.match(/^(\d+)(st|nd|rd|th)\s+Conjugation/);
    if (conjugationMatch) {
      return `${conjugationMatch[1]}${conjugationMatch[2]}`;
    }

    // Handle special case for "3rd -IO Conjugation"
    if (section.includes('3rd -IO Conjugation')) {
      return '3rd';
    }

    return undefined;
  }

  private static isDeponentVerb(grammaticalInfo: string): boolean {
    return grammaticalInfo.includes('ari') || grammaticalInfo.includes('atus sum') || grammaticalInfo.includes('or,');
  }

  static isVerbEntry(section: string): boolean {
    return section.includes('Verbs') || section.includes('Conjugation');
  }

  static extractVerbInfo(wordForm: string, grammaticalInfo: string, section: string) {
    const principalParts = this.extractPrincipalParts(grammaticalInfo);

    return {
      principalParts,
      fullPrincipalParts: this.getFullPrincipalParts(wordForm, principalParts),
      conjugationClass: this.getConjugationClass(section),
      isDeponent: this.isDeponentVerb(grammaticalInfo),
      alternateForm: this.extractAlternateForm(grammaticalInfo),
      stem: this.getVerbStem(wordForm),
    };
  }
}
