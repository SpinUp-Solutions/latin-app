import type { Firestore } from 'firebase-admin/firestore';
import { FieldPath } from 'firebase-admin/firestore';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';
import type { Word } from '@/src/types/admin-vocabulary';
import type { VocabularyPoolStudyData } from '@/src/types/vocabulary';
import { toVocabularyPoolStudyItems } from '@/src/utils/vocabularyPoolStudy';

export type VocabularyPoolLoader = (poolId: string) => Promise<VocabularyPoolStudyData>;

export function createFirestoreVocabularyPoolLoader(db: Firestore): VocabularyPoolLoader {
  return async poolId => {
    const poolSnapshot = await db.collection('vocabulary_pools').doc(poolId).get();
    if (!poolSnapshot.exists) throw new Error(`Vocabulary pool ${poolId} was not found`);

    const poolData = poolSnapshot.data() ?? {};
    const wordIds = Array.isArray(poolData.wordDocIds)
      ? poolData.wordDocIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const snapshots = await Promise.all(
      Array.from({ length: Math.ceil(wordIds.length / 10) }, (_, index) =>
        db
          .collection(VOCABULARY_WORDS_COLLECTION)
          .where(FieldPath.documentId(), 'in', wordIds.slice(index * 10, index * 10 + 10))
          .get()
      )
    );
    const wordsById = new Map(
      snapshots
        .flatMap(snapshot => snapshot.docs)
        .map(document => {
          const data = document.data();
          return [
            document.id,
            {
              id: document.id,
              ...data,
              wordType: data.part_of_speech,
            } as Word,
          ] as const;
        })
    );
    const words = wordIds.map(id => wordsById.get(id)).filter((word): word is Word => Boolean(word));

    return {
      id: poolId,
      name: typeof poolData.name === 'string' && poolData.name.trim() ? poolData.name : 'Vocabulary Pool',
      items: toVocabularyPoolStudyItems(words),
    };
  };
}
