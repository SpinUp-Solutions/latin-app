import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';
import { Word } from '@/src/types/admin-vocabulary';

export interface WordLookupResult {
  found: boolean;
  word?: Word;
  error?: string;
}

export class WordLookupService {
  private static readonly COLLECTION_NAME = 'words';

  /**
   * Search for a word in the Firebase words collection
   * @param searchTerm - The word to search for
   * @returns Promise with the word data if found
   */
  static async searchWord(searchTerm: string): Promise<WordLookupResult> {
    try {
      if (!searchTerm.trim()) {
        return { found: false, error: 'Search term cannot be empty' };
      }

      const normalizedTerm = searchTerm.toLowerCase().trim();

      // Query for exact match first
      const wordsRef = collection(db, this.COLLECTION_NAME);
      const exactQuery = query(wordsRef, where('word', '==', normalizedTerm), limit(1));

      const exactSnapshot = await getDocs(exactQuery);

      if (!exactSnapshot.empty) {
        const doc = exactSnapshot.docs[0];
        const wordData = { id: doc.id, ...doc.data() } as Word;
        return { found: true, word: wordData };
      }

      // If no exact match, try case-insensitive search
      // Note: This requires a more complex query or client-side filtering
      // For now, we'll do a broader search and filter client-side
      const broadQuery = query(wordsRef, limit(50));
      const broadSnapshot = await getDocs(broadQuery);

      for (const doc of broadSnapshot.docs) {
        const data = doc.data();
        if (data.word && data.word.toLowerCase() === normalizedTerm) {
          const wordData = { id: doc.id, ...data } as Word;
          return { found: true, word: wordData };
        }
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
