import type { Firestore } from 'firebase-admin/firestore';
import type { Word } from '@/src/types/admin-vocabulary';
import type { VocabularyPoolStudyData } from '@/src/types/vocabulary';
import { toVocabularyPoolStudyItems } from '@/src/utils/vocabularyPoolStudy';
import { getReadableVocabularyPool, loadVocabularyPoolWords } from '@/src/lib/vocabulary-pools/archive.server';

export type VocabularyPoolLoader = (poolId: string) => Promise<VocabularyPoolStudyData>;

export function createFirestoreVocabularyPoolLoader(db: Firestore): VocabularyPoolLoader {
  return async poolId => {
    const pool = await getReadableVocabularyPool(db, poolId);
    if (!pool) throw new Error(`Vocabulary pool ${poolId} was not found`);

    const poolData = pool.data;
    const words = (await loadVocabularyPoolWords(pool)).map(document => {
      const data = document.data();
      return { id: document.id, ...data, wordType: data.part_of_speech } as Word;
    });

    return {
      id: poolId,
      name: typeof poolData.name === 'string' && poolData.name.trim() ? poolData.name : 'Vocabulary Pool',
      items: toVocabularyPoolStudyItems(words),
    };
  };
}
