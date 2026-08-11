import { auth } from './firebase';
import { stripMacrons } from '@/src/utils/exercises/helpers';

type WordFormLike =
  | string
  | {
      full_form?: string | null;
      shortened_form?: string | null;
    }
  | null;

export interface TooltipLookupWord {
  id: string;
  word: string;
  translation?: string | null;
  pronunciation?: string | null;
  part_of_speech?: string | null;
  wordType?: string | null;
  type?: string | null;
  definition?: string | null;
  definitions?: string[] | null;
  etymology?: string | null;
  gender?: string | null;
  declension?: string | null;
  declensionClass?: string | null;
  conjugation?: string | null;
  conjugationClass?: string | null;
  grammaticalInfo?: string | null;
  dictionary_entry?: string | null;
  principal_parts?: WordFormLike[] | null;
  principalParts?: string[] | null;
  dictionary_forms?: WordFormLike[] | null;
  pronoun_type?: string | null;
  person?: string | null;
  is_deponent?: boolean | null;
}

export interface WordLookupResult {
  found: boolean;
  word?: TooltipLookupWord;
  error?: string;
}

export class WordLookupService {
  /**
   * Search for a word in the Firebase words collection
   * Supports macron-insensitive matching via the sort_key field
   * @param searchTerm - The word to search for
   * @returns Promise with the word data if found
   */
  static async searchWord(searchTerm: string): Promise<WordLookupResult> {
    try {
      if (!searchTerm.trim()) {
        return { found: false, error: 'Search term cannot be empty' };
      }

      const user = auth.currentUser;
      if (!user) return { found: false, error: 'Authentication required' };
      const token = await user.getIdToken();
      const response = await fetch(`/api/words/search?search=${encodeURIComponent(searchTerm.trim())}&limit=5`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'Authentication required' : 'Word lookup failed');
      const payload = (await response.json()) as { data?: { words?: TooltipLookupWord[] } };
      const words = payload.data?.words ?? [];
      if (words.length > 0) {
        const searchKey = stripMacrons(searchTerm.toLowerCase().trim());
        const exact = words.find(word => stripMacrons(word.word.toLowerCase()) === searchKey);
        return { found: true, word: exact ?? words[0] };
      }

      return { found: false };
    } catch (error) {
      console.error('Error searching for word:', error);
      return {
        found: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Convert Firebase word data (legacy or v5 schema) to tooltip-compatible format
   * @param word - The word object from Firebase
   * @returns Tooltip-compatible data object
   */
  static convertToTooltipData(word: TooltipLookupWord) {
    const definitions = this.getDefinitions(word);

    // Map Firebase word data to tooltip interface
    const tooltipData = {
      word: word.word,
      translation: word.translation || '',
      pronunciation: word.pronunciation || '',
      partOfSpeech: word.part_of_speech || word.wordType || '',
      wordType: this.getDetailedWordType(word),
      definition: definitions.join('; '),
      examples: this.extractExamples(definitions),
      etymology: word.etymology || '',
      // Additional fields specific to word types
      gender: word.gender || '',
      declensionClass: word.declensionClass || word.declension || '',
      conjugationClass: word.conjugationClass || word.conjugation || '',
      grammaticalInfo: word.grammaticalInfo || word.dictionary_entry || '',
      principalParts: this.getPrincipalParts(word),
    };

    return tooltipData;
  }

  /**
   * Get detailed word type information
   */
  private static getDetailedWordType(word: TooltipLookupWord): string {
    const parts: string[] = [];
    const legacyWordType = typeof word.wordType === 'string' ? word.wordType : '';
    const v5WordType = typeof word.type === 'string' ? word.type : '';
    const pos = typeof word.part_of_speech === 'string' ? word.part_of_speech : '';

    if (legacyWordType && legacyWordType !== pos) {
      parts.push(legacyWordType);
    } else if (v5WordType) {
      parts.push(v5WordType);
    }

    if (word.gender) {
      parts.push(word.gender);
    }

    const declension = word.declensionClass || word.declension;
    if (declension) {
      parts.push(`${declension} declension`);
    }

    const conjugation = word.conjugationClass || word.conjugation;
    if (conjugation) {
      parts.push(`${conjugation} conjugation`);
    }

    if (word.pronoun_type) {
      parts.push(word.pronoun_type);
    }

    if (word.person) {
      parts.push(word.person);
    }

    if (word.is_deponent) {
      parts.push('deponent');
    }

    return Array.from(new Set(parts)).join(', ');
  }

  /**
   * Extract example sentences from definitions
   */
  private static extractExamples(definitions: string[]): string[] {
    const examples: string[] = [];

    for (const def of definitions) {
      // Look for quoted examples in definitions
      const quotedMatches = def.match(/"([^"]+)"/g);
      if (quotedMatches) {
        examples.push(...quotedMatches.map(match => match.replace(/"/g, '')));
      }

      // Look for examples after "e.g." or similar patterns
      const exampleMatches = def.match(/(?:e\.g\.|example|for instance)[:\s]+([^.]+)/gi);
      if (exampleMatches) {
        examples.push(
          ...exampleMatches.map(match => match.replace(/(?:e\.g\.|example|for instance)[:\s]+/gi, '').trim())
        );
      }
    }

    return examples.slice(0, 3); // Limit to 3 examples
  }

  private static getDefinitions(word: TooltipLookupWord): string[] {
    if (Array.isArray(word.definitions)) {
      return word.definitions.filter((def): def is string => typeof def === 'string' && def.trim().length > 0);
    }

    if (typeof word.definition === 'string' && word.definition.trim().length > 0) {
      return [word.definition];
    }

    return [];
  }

  private static getPrincipalParts(word: TooltipLookupWord): string[] {
    if (Array.isArray(word.principalParts)) {
      return word.principalParts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    }

    const v5Forms = word.principal_parts || word.dictionary_forms;
    if (!Array.isArray(v5Forms)) {
      return [];
    }

    return v5Forms
      .map(form => {
        if (typeof form === 'string') return form.trim();
        if (!form || typeof form !== 'object') return '';
        const fullForm = typeof form.full_form === 'string' ? form.full_form.trim() : '';
        if (fullForm) return fullForm;
        const shortenedForm = typeof form.shortened_form === 'string' ? form.shortened_form.trim() : '';
        return shortenedForm;
      })
      .filter((part): part is string => part.length > 0);
  }
}
