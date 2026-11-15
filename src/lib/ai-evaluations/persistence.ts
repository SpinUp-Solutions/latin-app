import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import type { z } from 'zod';
import { AI_EVALUATION_CASES_COLLECTION } from '../../../shared/constants/firestore';
import { evaluationCaseInputSchema, type StoredEvaluationCase } from './contracts';

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

/**
 * The saved cases of one evaluation suite. Every suite lists, reads, saves and
 * deletes its cases the same way; only the collection and the case input differ.
 */
export function evaluationCaseStore<Schema extends z.ZodObject>(collectionName: string, inputSchema: Schema) {
  type Input = z.infer<Schema>;
  type Case = StoredEvaluationCase<Input>;
  const cases = (db: Firestore) => db.collection(collectionName);

  const parse = (snapshot: DocumentSnapshot): Case => {
    if (!snapshot.exists) {
      throw new AIEvaluationServiceError('AI_EVALUATION_CASE_NOT_FOUND', 'Evaluation case not found', 404);
    }
    const data = snapshot.data() ?? {};
    const { createdAt, createdBy, updatedAt, updatedBy } = data;
    // The input schema is strict, so it is given its own fields only.
    const parsed = inputSchema.safeParse(
      Object.fromEntries(Object.keys(inputSchema.shape).map(field => [field, data[field]]))
    );
    if (!parsed.success || !createdAt || !createdBy || !updatedAt || !updatedBy) {
      throw new AIEvaluationServiceError(
        'AI_EVALUATION_CASE_INVALID',
        `Evaluation case ${snapshot.id} contains invalid persisted data`,
        409
      );
    }
    return { ...parsed.data, id: snapshot.id, createdAt, createdBy, updatedAt, updatedBy };
  };

  const get = async (id: string, db: Firestore) => parse(await cases(db).doc(id).get());

  return {
    inputSchema,
    parse,
    get,
    list: async (db: Firestore) => (await cases(db).orderBy('updatedAt', 'desc').limit(100).get()).docs.map(parse),
    /** Creates a case, or replaces the input of the saved case `caseId`. */
    async save(caseId: string | undefined, input: Input, actorId: string, db: Firestore): Promise<Case> {
      const existing = caseId ? await get(caseId, db) : undefined;
      const reference = existing ? cases(db).doc(existing.id) : cases(db).doc();
      const timestamp = new Date().toISOString();
      const metadata = {
        createdAt: existing?.createdAt ?? timestamp,
        createdBy: existing?.createdBy ?? actorId,
        updatedAt: timestamp,
        updatedBy: actorId,
      };
      await reference.set({ ...input, ...metadata });
      return { ...input, ...metadata, id: reference.id };
    },
    async remove(id: string, db: Firestore): Promise<void> {
      const existing = await get(id, db);
      await cases(db).doc(existing.id).delete();
    },
  };
}

export type EvaluationCaseStore<Schema extends z.ZodObject> = ReturnType<typeof evaluationCaseStore<Schema>>;

export const aiEvaluationCases = evaluationCaseStore(AI_EVALUATION_CASES_COLLECTION, evaluationCaseInputSchema);
