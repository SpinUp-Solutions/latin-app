import { createNewContent } from '@/src/utils/contentFactory';
import type { MatchingExercise } from '@/src/types/exercise';

describe('content factory', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses matching item IDs when the clock advances during construction', () => {
    let now = 1_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now++);

    const exercise = createNewContent('matching') as MatchingExercise;
    const [firstLeft, secondLeft] = exercise.data.leftColumn;
    const [firstRight, secondRight] = exercise.data.rightColumn;

    expect(exercise.data.answers).toEqual({
      [firstLeft.id]: firstRight.id,
      [secondLeft.id]: secondRight.id,
    });
  });
});
