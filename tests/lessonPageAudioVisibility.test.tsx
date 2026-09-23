import React from 'react';
import { render } from '@testing-library/react';
import AudioPlayButton from '@/src/components/ui/core/audio-play-button';
import { LessonPageVisibilityContext } from '@/src/components/ui/lesson/page-visibility-context';

const mockPause = jest.fn();
jest.mock('@/src/hooks/useAudio', () => ({
  useAudio: () => ({
    audioRef: { current: null },
    isPlaying: false,
    isLoading: false,
    play: jest.fn(),
    pause: mockPause,
  }),
}));

it('pauses exercise audio when its retained lesson page becomes hidden', () => {
  const { rerender } = render(
    <LessonPageVisibilityContext.Provider value>
      <AudioPlayButton audioPath="exercise.mp3" />
    </LessonPageVisibilityContext.Provider>
  );
  expect(mockPause).not.toHaveBeenCalled();

  rerender(
    <LessonPageVisibilityContext.Provider value={false}>
      <AudioPlayButton audioPath="exercise.mp3" />
    </LessonPageVisibilityContext.Provider>
  );
  expect(mockPause).toHaveBeenCalledTimes(1);
});
