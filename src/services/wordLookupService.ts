import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { Word } from '@/src/types/admin-vocabulary';
import { stripMacrons } from '@/src/utils/exercises/helpers';

export interface WordLookupResult {
  found: boolean;
  word?: Word;
  error?: string;
}

export class WordLookupService {
  private static readonly COLLECTION_NAME = 'words';

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

      const normalizedTerm = searchTerm.toLowerCase().trim();
      const wordsRef = collection(db, this.COLLECTION_NAME);

      // Query for exact match first
      const exactQuery = query(wordsRef, where('word', '==', normalizedTerm), limit(1));
      const exactSnapshot = await getDocs(exactQuery);

      if (!exactSnapshot.empty) {
        const doc = exactSnapshot.docs[0];
        const wordData = { id: doc.id, ...doc.data() } as Word;
        return { found: true, word: wordData };
      }

      // Fallback: macron-insensitive search via sort_key
      const searchKey = stripMacrons(normalizedTerm);
      const sortKeyQuery = query(
        wordsRef,
        orderBy('sort_key'),
        where('sort_key', '>=', searchKey),
        where('sort_key', '<=', searchKey + '\uf8ff'),
        limit(5)
      );
      const sortKeySnapshot = await getDocs(sortKeyQuery);

      if (!sortKeySnapshot.empty) {
        // Prefer an exact sort_key match, otherwise take the first result
        const exactSortKeyDoc = sortKeySnapshot.docs.find(doc => doc.data().sort_key === searchKey);
        const bestDoc = exactSortKeyDoc || sortKeySnapshot.docs[0];
        const wordData = { id: bestDoc.id, ...bestDoc.data() } as Word;
        return { found: true, word: wordData };
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
   * Convert Firebase Word data to tooltip-compatible format
   * @param word - The Word object from Firebase
   * @returns Tooltip-compatible data object
   */
  static convertToTooltipData(word: Word) {
    // Map Firebase word data to tooltip interface
    const tooltipData = {
      word: word.word,
      translation: word.translation,
      pronunciation: word.pronunciation || '',
      partOfSpeech: word.wordType,
      wordType: this.getDetailedWordType(word),
      definition: word.definitions?.join('; ') || '',
      examples: this.extractExamples(word.definitions || []),
      etymology: word.etymology || '',
      // Additional fields specific to word types
      gender: word.gender || '',
      declensionClass: word.declensionClass || '',
      conjugationClass: word.conjugationClass || '',
      grammaticalInfo: word.grammaticalInfo || '',
      principalParts: word.principalParts || [],
    };

    return tooltipData;
  }

  /**
   * Get detailed word type information
   */
  private static getDetailedWordType(word: Word): string {
    const parts = [];

    if (word.wordType) {
      parts.push(word.wordType);
    }

    if (word.gender) {
      parts.push(word.gender);
    }

    if (word.declensionClass) {
      parts.push(`${word.declensionClass} declension`);
    }

    if (word.conjugationClass) {
      parts.push(`${word.conjugationClass} conjugation`);
    }

    return parts.join(', ');
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
}
