import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { VOCABULARY_EVALUATION_CASES_COLLECTION } from '../../../shared/constants/firestore';
import { AIEvaluationServiceError } from '../ai-evaluations/persistence';
import {
  vocabularyEvaluationCaseInputSchema,
  type VocabularyEvaluationCase,
  type VocabularyEvaluationCaseInput,
} from './contracts';

const casesCollection = (db: Firestore) => db.collection(VOCABULARY_EVALUATION_CASES_COLLECTION);

export const parseVocabularyEvaluationCaseSnapshot = (snapshot: DocumentSnapshot): VocabularyEvaluationCase => {
  if (!snapshot.exists) {
    throw new AIEvaluationServiceError('AI_EVALUATION_CASE_NOT_FOUND', 'Evaluation case not found', 404);
  }
  const data = snapshot.data();
  const parsed = vocabularyEvaluationCaseInputSchema.safeParse({ title: data?.title, entries: data?.entries });
  const metadata = data as Partial<VocabularyEvaluationCase> | undefined;
  if (!parsed.success || !metadata?.createdAt || !metadata.createdBy || !metadata.updatedAt || !metadata.updatedBy) {
    throw new AIEvaluationServiceError(
      'AI_EVALUATION_CASE_INVALID',
      `Evaluation case ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
  return {
    ...parsed.data,
    id: snapshot.id,
    createdAt: metadata.createdAt,
    createdBy: metadata.createdBy,
    updatedAt: metadata.updatedAt,
    updatedBy: metadata.updatedBy,
  };
};

export async function listVocabularyEvaluationCases(db: Firestore): Promise<VocabularyEvaluationCase[]> {
  const snapshot = await casesCollection(db).orderBy('updatedAt', 'desc').limit(100).get();
  return snapshot.docs.map(parseVocabularyEvaluationCaseSnapshot);
}

export async function getVocabularyEvaluationCase(id: string, db: Firestore): Promise<VocabularyEvaluationCase> {
  return parseVocabularyEvaluationCaseSnapshot(await casesCollection(db).doc(id).get());
}

export async function saveVocabularyEvaluationCase(
  caseId: string | undefined,
  input: VocabularyEvaluationCaseInput,
  actorId: string,
  db: Firestore,
  now: () => string = () => new Date().toISOString()
): Promise<VocabularyEvaluationCase> {
  const timestamp = now();
  const existing = caseId ? await getVocabularyEvaluationCase(caseId, db) : undefined;
  const reference = existing ? casesCollection(db).doc(existing.id) : casesCollection(db).doc();
  const value = {
    ...input,
    createdAt: existing?.createdAt ?? timestamp,
    createdBy: existing?.createdBy ?? actorId,
    updatedAt: timestamp,
    updatedBy: actorId,
  } satisfies Omit<VocabularyEvaluationCase, 'id'>;
  await reference.set(value);
  return { ...value, id: reference.id };
}

export async function deleteVocabularyEvaluationCase(id: string, db: Firestore): Promise<void> {
  const existing = await getVocabularyEvaluationCase(id, db);
  await casesCollection(db).doc(existing.id).delete();
}
