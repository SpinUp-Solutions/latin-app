import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { AI_EVALUATION_CASES_COLLECTION, AI_EVALUATION_RUNS_COLLECTION } from '../../../shared/constants/firestore';
import {
  evaluationCaseIdSchema,
  evaluationCaseInputSchema,
  type EvaluationCase,
  type EvaluationCaseInput,
  type EvaluationRunResult,
  type EvaluationRunSummary,
} from './contracts';

export class AIEvaluationServiceError extends Error {
  constructor(
    public readonly code:
      | 'AI_EVALUATION_CASE_NOT_FOUND'
      | 'AI_EVALUATION_CASE_INVALID'
      | 'AI_EVALUATION_RUN_INVALID'
      | 'AI_EVALUATION_CRITERIA_REQUIRED',
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
    modes: data?.modes,
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

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const validIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const parseRunSummary = (snapshot: DocumentSnapshot): EvaluationRunSummary => {
  const value = snapshot.data() as Partial<EvaluationRunSummary> | undefined;
  if (
    !value ||
    typeof value.caseId !== 'string' ||
    typeof value.caseTitle !== 'string' ||
    typeof value.createdBy !== 'string' ||
    !validIsoTimestamp(value.startedAt) ||
    !validIsoTimestamp(value.completedAt) ||
    typeof value.forceRefresh !== 'boolean' ||
    !finiteNonNegative(value.evaluatedCellCount) ||
    !finiteNonNegative(value.failedCellCount) ||
    !finiteNonNegative(value.criteriaPassedCount) ||
    !finiteNonNegative(value.criteriaFailedCount) ||
    !(value.costIncurredThisRun === null || finiteNonNegative(value.costIncurredThisRun)) ||
    !finiteNonNegative(value.wallTimeMs)
  ) {
    throw new AIEvaluationServiceError(
      'AI_EVALUATION_RUN_INVALID',
      `Evaluation run ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
  return {
    id: snapshot.id,
    caseId: value.caseId,
    caseTitle: value.caseTitle,
    createdBy: value.createdBy,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    forceRefresh: value.forceRefresh,
    evaluatedCellCount: value.evaluatedCellCount,
    failedCellCount: value.failedCellCount,
    criteriaPassedCount: value.criteriaPassedCount,
    criteriaFailedCount: value.criteriaFailedCount,
    costIncurredThisRun: value.costIncurredThisRun,
    wallTimeMs: value.wallTimeMs,
  };
};

const firestoreValue = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function persistEvaluationRun(
  evaluationCase: EvaluationCase,
  result: EvaluationRunResult,
  actorId: string,
  db: Firestore
): Promise<EvaluationRunResult> {
  const reference = db.collection(AI_EVALUATION_RUNS_COLLECTION).doc();
  const summary: Omit<EvaluationRunSummary, 'id'> = {
    caseId: evaluationCase.id,
    caseTitle: evaluationCase.title,
    createdBy: actorId,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    forceRefresh: result.forceRefresh,
    evaluatedCellCount: result.aggregate.evaluatedCellCount,
    failedCellCount: result.aggregate.failedCellCount,
    criteriaPassedCount: result.aggregate.criteriaPassedCount,
    criteriaFailedCount: result.aggregate.criteriaFailedCount,
    costIncurredThisRun: result.aggregate.costIncurredThisRun?.totalCost ?? null,
    wallTimeMs: result.aggregate.wallTimeMs,
  };
  // Run history is deliberately aggregate-only. The saved case owns source
  // and answer text; deleting it must not leave a second copy in historical
  // run documents or result-cell subcollections.
  await reference.set(
    firestoreValue({
      ...summary,
      schemaVersion: result.schemaVersion,
      aggregate: result.aggregate,
    })
  );
  return { ...result, runId: reference.id, historySaved: true };
}

export async function listEvaluationRunSummaries(db: Firestore): Promise<EvaluationRunSummary[]> {
  const snapshot = await db.collection(AI_EVALUATION_RUNS_COLLECTION).orderBy('completedAt', 'desc').limit(20).get();
  return snapshot.docs.map(parseRunSummary);
}
