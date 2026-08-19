import type { StudentSubmittedTestAttempt, TestAttemptResultSummary } from './test';
import type { StudentTestResultReview } from '@/src/lib/tests/review';

export type {
  ReviewPartPoints,
  StudentTestResultReview,
  TestResultReview,
  TestResultReviewContent,
  TestResultReviewExerciseItem,
  TestResultReviewItem,
  TestResultReviewPage,
  TestResultReviewSupportingItem,
} from '@/src/lib/tests/review';

/**
 * Student-facing, read-only representation of a submitted test attempt.
 * `review` is null only for attempts that predate detailed review snapshots
 * (or whose snapshot cannot be parsed); the frozen result summary always works.
 */
export interface StudentTestResult {
  attempt: StudentSubmittedTestAttempt;
  review: StudentTestResultReview | null;
}

/** Compact latest-result card for hidden or archived mocks the student submitted. */
export interface StudentPastMockResult {
  id: string;
  title: string;
  description: string;
  passingPercentage: number | null;
  latest: TestAttemptResultSummary;
}
