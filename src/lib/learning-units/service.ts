import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { LEARNING_UNITS_COLLECTION } from '@/shared/constants/firestore';
import { adminDb } from '@/src/services/firebase-admin';
import type { TestUnit } from '@/src/types/learning-unit';
import { normalizeLearningUnit } from './domain';
import { LearningUnitServiceError } from './errors';

export { LearningUnitServiceError } from './errors';

function testUnitFromSnapshot(snapshot: DocumentSnapshot): TestUnit {
  if (!snapshot.exists) {
    throw new LearningUnitServiceError('TEST_NOT_FOUND', 'Test not found', 404);
  }

  try {
    const unit = normalizeLearningUnit(snapshot.data(), snapshot.id);
    if (unit.kind !== 'test') {
      throw new LearningUnitServiceError('TEST_NOT_FOUND', 'Test not found', 404);
    }
    return unit;
  } catch (error) {
    if (error instanceof LearningUnitServiceError) throw error;
    throw new LearningUnitServiceError(
      'STALE_LEARNING_UNIT_DATA',
      `Test ${snapshot.id} contains invalid persisted data`,
      409
    );
  }
}

export class LearningUnitService {
  constructor(private readonly db: Firestore = adminDb) {}

  private get units() {
    return this.db.collection(LEARNING_UNITS_COLLECTION);
  }

  testRef(testId: string) {
    return this.units.doc(testId);
  }

  parseTestSnapshot(snapshot: DocumentSnapshot): TestUnit {
    return testUnitFromSnapshot(snapshot);
  }

  async listTests(): Promise<TestUnit[]> {
    const snapshot = await this.units.where('kind', '==', 'test').orderBy('updatedAt', 'desc').get();
    return snapshot.docs.map(testUnitFromSnapshot);
  }

  async getTest(testId: string): Promise<TestUnit> {
    return testUnitFromSnapshot(await this.testRef(testId).get());
  }
}

export const learningUnitService = new LearningUnitService();
