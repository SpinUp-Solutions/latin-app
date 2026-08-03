import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import {
  AI_EVALUATION_CASES_COLLECTION,
  evaluationCaseIdSchema,
  evaluationCaseInputSchema,
  type EvaluationCase,
  type EvaluationCaseInput,
} from './contracts';

export class AIEvaluationServiceError extends Error {
  constructor(
    public readonly code: 'AI_EVALUATION_CASE_NOT_FOUND' | 'AI_EVALUATION_CASE_INVALID',
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'AIEvaluationServiceError';
  }
}

const casesCollection = (db: Firestore) => db.collection(AI_EVALUATION_CASES_COLLECTION);

const parseCaseSnapshot = (snapshot: DocumentSnapshot): EvaluationCase => {
  if (!snapshot.exists) {
    throw new AIEvaluationServiceError('AI_EVALUATION_CASE_NOT_FOUND', 'Evaluation case not found', 404);
  }

  const data = snapshot.data();
  const parsed = evaluationCaseInputSchema.safeParse({
    title: data?.title,
    direction: data?.direction,
    sourceText: data?.sourceText,
    answers: data?.answers,
    // Cases created before modes existed preserve their original lesson-only
    // meaning instead of silently doubling their model calls and cost.
    modes: data?.modes ?? ['lesson'],
  });
  const metadata = data as Partial<EvaluationCase> | undefined;
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

export async function listEvaluationCases(db: Firestore): Promise<EvaluationCase[]> {
  const snapshot = await casesCollection(db).orderBy('updatedAt', 'desc').limit(100).get();
  return snapshot.docs.map(parseCaseSnapshot);
}

export async function getEvaluationCase(id: string, db: Firestore): Promise<EvaluationCase> {
  const validId = evaluationCaseIdSchema.parse(id);
  return parseCaseSnapshot(await casesCollection(db).doc(validId).get());
}

export async function createEvaluationCase(
  input: EvaluationCaseInput,
  actorId: string,
  db: Firestore,
  now: () => string = () => new Date().toISOString()
): Promise<EvaluationCase> {
  const parsed = evaluationCaseInputSchema.parse(input);
  const timestamp = now();
  const reference = casesCollection(db).doc();
  const value = {
    ...parsed,
    createdAt: timestamp,
    createdBy: actorId,
    updatedAt: timestamp,
    updatedBy: actorId,
  } satisfies Omit<EvaluationCase, 'id'>;
  await reference.set(value);
  return { ...value, id: reference.id };
}

export async function updateEvaluationCase(
  id: string,
  input: EvaluationCaseInput,
  actorId: string,
  db: Firestore,
  now: () => string = () => new Date().toISOString()
): Promise<EvaluationCase> {
  const existing = await getEvaluationCase(id, db);
  const parsed = evaluationCaseInputSchema.parse(input);
  const persisted = {
    ...parsed,
    createdAt: existing.createdAt,
    createdBy: existing.createdBy,
    updatedAt: now(),
    updatedBy: actorId,
  } satisfies Omit<EvaluationCase, 'id'>;
  await casesCollection(db).doc(existing.id).set(persisted);
  return { ...persisted, id: existing.id };
}

export async function deleteEvaluationCase(id: string, db: Firestore): Promise<void> {
  const existing = await getEvaluationCase(id, db);
  await casesCollection(db).doc(existing.id).delete();
}

export const parseEvaluationCaseSnapshot = parseCaseSnapshot;
