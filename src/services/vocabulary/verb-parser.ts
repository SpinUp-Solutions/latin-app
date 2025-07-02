import { ParsedEntry } from '@/src/types/vocabulary';

export class VerbParser {
  /**
   * Parse a verb entry from the vocabulary file
   */
  static parseVerbEntry(line: string, section: string, subsection: string): ParsedEntry | null {
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

    // Extract alternate form if present
    const alternateForm = this.extractAlternateForm(wordInfo);

    // Extract principal parts
    const principalParts = this.extractPrincipalParts(wordInfo);

    // Determine conjugation class
    const conjugationClass = this.getConjugationClass(section);

    // Determine if deponent (will be set later by main parser if in deponent section)
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

  /**
   * Extract alternate form from verb grammatical info
   */
  private static extractAlternateForm(grammaticalInfo: string): string | undefined {
    // Pattern for parenthetical alternatives: "adjuvo (-are variant of adiuvo)"
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

  /**
   * Extract principal parts from verb grammatical info
   */
  private static extractPrincipalParts(grammaticalInfo: string): string[] {
    const parts: string[] = [];

    // Split by commas and clean up each part
    const rawParts = grammaticalInfo.split(',').map(part => part.trim());

    for (const part of rawParts) {
      // Process each part to handle different patterns
      const processedPart = this.processPrincipalPart(part);
      if (processedPart) {
        parts.push(processedPart);
      }
    }

    return parts;
  }

  /**
   * Process a single principal part
   */
  private static processPrincipalPart(rawPart: string): string | null {
    // Remove extra spaces and normalize
    let part = rawPart.trim();

    // Skip parts that are clearly not principal parts
    if (!part || part.length === 0) return null;

    // Handle different patterns:
    // "-are" -> "amare" (if we have the stem)
    if (part.startsWith('-')) {
      // This should be expanded using the verb stem, but for now return as-is
      return part;
    }

    // Handle "verb stem + ending" patterns
    if (part.includes(' ')) {
      // Take the first word if multiple words
      part = part.split(' ')[0];
    }

    return part;
  }

  /**
   * Get the full form of principal parts (expand abbreviated forms)
   */
  static getFullPrincipalParts(wordForm: string, principalParts: string[]): string[] {
    const fullParts: string[] = [];
    const stem = this.getVerbStem(wordForm);

    for (const part of principalParts) {
      if (part.startsWith('-') && stem) {
        // Expand abbreviated form: "-are" -> "amare"
        fullParts.push(stem + part);
      } else {
        fullParts.push(part);
      }
    }

    return fullParts;
  }

  /**
   * Extract verb stem for expanding principal parts
   */
  private static getVerbStem(wordForm: string): string {
    // For most verbs, remove the final 'o' or 'or'
    if (wordForm.endsWith('or')) {
      return wordForm.slice(0, -2); // Remove 'or' for deponents
    } else if (wordForm.endsWith('o')) {
      return wordForm.slice(0, -1); // Remove 'o' for regular verbs
    }
    return wordForm;
  }

  /**
   * Determine conjugation class from section
   */
  private static getConjugationClass(section: string): string | undefined {
    const conjugationMatch = section.match(/(\d+)(st|nd|rd|th)\s+Conjugation/);
    if (conjugationMatch) {
      return `${conjugationMatch[1]}${conjugationMatch[2]}`;
    }
    return undefined;
  }

  /**
   * Check if verb is deponent based on its form
   */
  private static isDeponentVerb(grammaticalInfo: string): boolean {
    // Deponent verbs typically end in -or, -ari, -atus sum
    return grammaticalInfo.includes('ari') || grammaticalInfo.includes('atus sum') || grammaticalInfo.includes('or,');
  }

  /**
   * Check if a line represents a verb entry
   */
  static isVerbEntry(section: string): boolean {
    return section.includes('Verbs') || section.includes('Conjugation');
  }

  /**
   * Extract all verb-specific information from grammatical info
   */
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
