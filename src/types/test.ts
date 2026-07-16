import type { Exercise } from './exercises';
import type { RenderableContentItem } from './page';
import type { Page } from './page';

export interface TestVersionReference {
  versionId: string;
  label: string;
  /** null participates in normal rotation; a value identifies its mock-only card. */
  mockTestId: string | null;
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
