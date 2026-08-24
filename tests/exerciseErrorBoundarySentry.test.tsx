/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ExerciseErrorBoundary } from '@/src/components/ui/lesson/exercise-error-boundary';
import { captureException } from '@sentry/nextjs';

function Boom(): React.ReactElement {
  throw new Error('Exercise boundary unit test boom');
}

describe('ExerciseErrorBoundary', () => {
  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('captures render crashes with lesson/exercise tags', () => {
    render(
      <ExerciseErrorBoundary
        lessonId="lesson-42"
        exerciseId="ex-9"
        contentType="matching"
        pageIndex={2}
        itemIndex={1}>
        <Boom />
      </ExerciseErrorBoundary>
    );

    expect(screen.getByText('This exercise failed to load')).toBeInTheDocument();
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Exercise boundary unit test boom' }),
      expect.objectContaining({
        tags: expect.objectContaining({
          surface: 'exercise_error_boundary',
          lessonId: 'lesson-42',
          exerciseId: 'ex-9',
          contentType: 'matching',
          pageIndex: '2',
          itemIndex: '1',
        }),
      })
    );
  });
});
