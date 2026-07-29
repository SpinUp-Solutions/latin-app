import type { TestUnit } from './learning-unit';
import type { Page } from './page';
import type { ExerciseAnswer } from './runtime-mode';
import type { VocabularyPoolStudyData } from './vocabulary';

export interface RotationVersionReference {
  versionId: string;
}

export interface TestVersion {
  id: string;
  name: string;
  pages: Page[];
  vocabularyPoolId?: string | null;
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
  configurationStatus?: 'ready' | 'unavailable';
};

export interface TestUnitDetail {
  test: TestUnit;
  versions: TestVersionSummary[];
  mocks?: Array<MockTest & { version: TestVersionSummary }>;
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

export interface MockTestSummary extends MockTest {
  totalPoints: number;
}

export interface StudentMockTestSummary {
  id: string;
  title: string;
  description: string;
  passingPercentage: number | null;
  totalPoints: number;
  attemptSummary: TestAttemptOriginSummary;
  scoreTrend: Array<{ percentage: number; submittedAt: string }>;
}

/**
 * Deliberately small origin projection used by the mock player.  An inactive
 * card is only ever returned with an already-frozen in-progress attempt; the
 * attempt delivery is the source of truth for resuming after an ownership or
 * visibility change.
 */
export interface StudentMockTestDetail {
  mock: Pick<
    MockTest,
    'id' | 'title' | 'description' | 'passingPercentage' | 'status' | 'isLive'
  >;
  attempt: Omit<StudentInProgressTestAttempt, 'answers'> | null;
}

export type TestAttemptOrigin = { kind: 'normal-test'; testId: string } | { kind: 'mock-test'; mockTestId: string };

export interface TestAttemptDeliveryState {
  versionId: string;
  pages: Page[];
  resolvedExercises: Record<string, { items: unknown[] }>;
  vocabularyPool?: VocabularyPoolStudyData;
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
  pages: Page[];
  resolvedExercises: Record<string, { items: unknown[] }>;
  vocabularyPool?: VocabularyPoolStudyData;
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

export interface SubmitTestAttemptResult {
  attempt: StudentSubmittedTestAttempt;
  /** True only when this submission newly wrote the sticky normal-flow completion record. */
  completionGranted: boolean;
}

export interface TestAttemptResultSummary {
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  outcome: SubmittedTestAttempt['outcome'];
  submittedAt: string;
}

export interface TestAttemptOriginSummary {
  origin: TestAttemptOrigin;
  inProgressAttemptId: string | null;
  attemptCount: number;
  best: TestAttemptResultSummary | null;
  latest: TestAttemptResultSummary | null;
}
