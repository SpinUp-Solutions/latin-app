'use client';

import { createContext, useContext } from 'react';
import type { TestTranslationGradeHandler } from '@/src/types/runtime-mode';
import type { TestTranslationGrades } from '@/src/types/test';

interface TestTranslationGradingContextValue {
  grades: TestTranslationGrades;
  grade: TestTranslationGradeHandler;
}

const TestTranslationGradingContext = createContext<TestTranslationGradingContextValue | null>(null);

export const TestTranslationGradingProvider = TestTranslationGradingContext.Provider;

export function useTestTranslationGrading() {
  return useContext(TestTranslationGradingContext);
}
