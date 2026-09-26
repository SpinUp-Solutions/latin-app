import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import useAudio from '@/src/hooks/useAudio';
import { auth } from '@/src/services/firebase';

const Harness = ({ path, onEnded }: { path: string; onEnded: () => void }) => {
  const { audioRef, isPlaying, isLoading, play, pause } = useAudio(path, onEnded);
  return (
    <>
      <audio ref={audioRef} />
      <button onClick={play}>Play</button>
      <button onClick={pause}>Pause</button>
      <span>{isLoading ? 'Loading' : isPlaying ? 'Playing' : 'Idle'}</span>
    </>
  );
};
const response = { ok: true, json: async () => ({ signedUrl: 'https://example.test/audio.mp3' }) } as Response;
let fetchMock: jest.SpyInstance;
let playMock: jest.SpyInstance;
beforeEach(() => {
  Object.assign(auth, { currentUser: { getIdToken: jest.fn().mockResolvedValue('test-token') } });
  playMock = jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response);
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});
const play = async () => {
  await act(async () => {
    fireEvent.click(screen.getByText('Play'));
  });
};

it('switches source on the same audio element and suppresses the old ended event', async () => {
  const onEnded = jest.fn();
  const { container, rerender } = render(<Harness path="first.mp3" onEnded={onEnded} />);
  await play();
  const audio = container.querySelector('audio')!;
  rerender(<Harness path="second.mp3" onEnded={onEnded} />);
  expect(screen.getByText('Idle')).toBeInTheDocument();
  expect(audio).not.toHaveAttribute('src');
  fireEvent.ended(audio);
  expect(onEnded).not.toHaveBeenCalled();
  await play();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).audioPath).toBe('second.mp3');
  expect(screen.getByText('Playing')).toBeInTheDocument();
});

it('resumes a paused source using its cached URL, and ends only once', async () => {
  const onEnded = jest.fn();
  const { container } = render(<Harness path="first.mp3" onEnded={onEnded} />);
  await play();
  fireEvent.click(screen.getByText('Pause'));
  const audio = container.querySelector('audio')!;
  fireEvent.ended(audio);
  expect(onEnded).not.toHaveBeenCalled();
  await play();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(playMock).toHaveBeenCalledTimes(2);
  fireEvent.ended(audio);
  fireEvent.ended(audio);
  expect(onEnded).toHaveBeenCalledTimes(1);
});

it('cancels playback while the authentication token is still pending', async () => {
  let resolve!: (token: string) => void;
  Object.assign(auth, {
    currentUser: {
      getIdToken: () =>
        new Promise<string>(r => {
          resolve = r;
        }),
    },
  });
  render(<Harness path="first.mp3" onEnded={jest.fn()} />);
  await play();
  expect(screen.getByText('Loading')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Pause'));
  await act(async () => {
    resolve('test-token');
  });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(playMock).not.toHaveBeenCalled();
  expect(screen.getByText('Idle')).toBeInTheDocument();
});
