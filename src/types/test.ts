import type { Exercise } from './exercises';
import type { TestUnit } from './learning-unit';
import type { RenderableContentItem } from './page';
import type { Page } from './page';
import type { ExerciseAnswer } from './runtime-mode';

export interface RotationVersionReference {
  versionId: string;
}

export interface TestVersion {
  id: string;
  name: string;
  pages: Page[];
  totalPages: number;
  totalItems: number;
  totalExercises: number;
  totalPoints: number;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type TestVersionSummary = Omit<TestVersion, 'pages'>;

export type TestUnitSummary = Omit<TestUnit, 'rotationVersions'> & {
  rotationVersionCount: number;
  minTotalPoints: number;
  maxTotalPoints: number;
};

export interface TestUnitDetail {
  test: TestUnit;
  versions: TestVersionSummary[];
}

export type MockTestParent = { kind: 'test'; testId: string } | { kind: 'standalone' };
export type MockTestStatus = 'active' | 'archived';

export interface MockTest {
  id: string;
  versionId: string;
  parent: MockTestParent;
  title: string;
  description: string;
  passingPercentage: number | null;
  status: MockTestStatus;
  isLive: boolean;
  mockOrder: number | null;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type TestAttemptOrigin = { kind: 'normal-test'; testId: string } | { kind: 'mock-test'; mockTestId: string };

export interface TestAttemptDeliveryState {
  versionId: string;
  pages: Page[];
  resolvedExercises: Record<string, { items: unknown[] }>;
}

export interface TestAttemptBase {
  id: string;
  studentId: string;
  versionId: string;
  passingPercentage: number | null;
  origin: TestAttemptOrigin;
  startedAt: string;
  updatedAt: string;
}

export interface InProgressTestAttempt extends TestAttemptBase {
  status: 'in-progress';
  answers: Record<string, ExerciseAnswer>;
  deliveryState: TestAttemptDeliveryState;
}

export interface TestAttemptExerciseResult {
  title?: string;
  awardedPoints: number;
  maxPoints: number;
}

export interface SubmittedTestAttempt extends TestAttemptBase {
  status: 'submitted';
  exerciseResults: Record<string, TestAttemptExerciseResult>;
  score: number;
  maxScore: number;
  percentage: number;
  outcome: 'score-only' | 'passed' | 'not-passed';
  submittedAt: string;
}

export type TestAttempt = InProgressTestAttempt | SubmittedTestAttempt;

export interface TestAttemptSession {
  id: string;
  studentId: string;
  origin: TestAttemptOrigin;
  attemptId: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentTestDelivery {
  versionId: string;
  pages: unknown[];
  resolvedExercises: Record<string, { items: unknown[] }>;
}

export type StudentInProgressTestAttempt = Omit<InProgressTestAttempt, 'studentId' | 'deliveryState'> & {
  delivery: StudentTestDelivery;
};

export type StudentSubmittedTestAttempt = Omit<SubmittedTestAttempt, 'studentId'>;
export type StudentTestAttempt = StudentInProgressTestAttempt | StudentSubmittedTestAttempt;

export interface StartTestAttemptResult {
  attempt: StudentInProgressTestAttempt;
  resumed: boolean;
}

export interface ScoredTestExercise {
  exercise: Exercise;
  maxPoints: number;
}

/** A non-scored item shown as part of a test, such as instructions or vocabulary. */
export interface TestContentItem {
  content: RenderableContentItem;
}

export type TestItem = ScoredTestExercise | TestContentItem;

export interface TestDefinition {
  id: string;
  title: string;
  description: string;
  /** Ordered test content. Exercises carry points; other content is informational. */
  items?: TestItem[];
  /** Test pages, matching the authoring structure used by lessons. */
  pages?: Page[];
  /** @deprecated Kept so existing tests can be read and migrated transparently. */
  exercises: ScoredTestExercise[];
  totalPoints: number;
  /** Temporary POC compatibility until test containers are persisted in Phase 3. */
  passingPercentage?: number | null;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  version?: number;
}

export type TestSummary = Pick<
  TestDefinition,
  'id' | 'title' | 'description' | 'totalPoints' | 'createdAt' | 'updatedAt' | 'version'
> & {
  exerciseCount: number;
};

export interface TestExerciseResult {
  exerciseId: string;
  title: string;
  earnedPoints: number;
  maxPoints: number;
  scorePercent: number;
}
