import { adminDb } from './firebase-admin';
import { FieldPath } from 'firebase-admin/firestore';
import type { VocabularyPool, VocabularyPoolWithWords } from '@/src/types/vocabulary-pool';
import type { Word } from '@/src/types/admin-vocabulary';

export class VocabularyPoolService {
  static async getPoolWithWords(poolId: string): Promise<VocabularyPoolWithWords> {
    const poolDoc = await adminDb.collection('vocabulary_pools').doc(poolId).get();
    if (!poolDoc.exists) {
      throw new Error('Pool not found');
    }

    const poolData = poolDoc.data();
    if (!poolData) {
      throw new Error('Pool data not found');
    }

    const pool: VocabularyPool = {
      id: poolDoc.id,
      ...poolData,
      metadata: {
        ...poolData.metadata,
        createdAt: poolData.metadata.createdAt.toDate(),
        updatedAt: poolData.metadata.updatedAt.toDate(),
      },
    } as VocabularyPool;

    const words = await this.fetchWordsInBatches(pool.wordDocIds);
    return { ...pool, words };
  }

  private static async fetchWordsInBatches(wordIds: string[]): Promise<Word[]> {
    if (wordIds.length === 0) return [];

    const words: Word[] = [];
    const batches = [];

    for (let i = 0; i < wordIds.length; i += 10) {
      const batch = wordIds.slice(i, i + 10);
      batches.push(adminDb.collection('words').where(FieldPath.documentId(), 'in', batch).get());
    }

    const batchResults = await Promise.all(batches);
    batchResults.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        words.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
        } as Word);
      });
    });

    const wordMap = new Map(words.map(word => [word.id, word]));
    return wordIds.map(id => wordMap.get(id)).filter(Boolean) as Word[];
  }
}
