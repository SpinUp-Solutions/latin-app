import { useState, useEffect, useRef, useCallback } from 'react';
import { auth } from '@/src/services/firebase';

interface UseAudioReturn {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  isLoading: boolean;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  onEnded: () => void;
  setAudioSource: (src: string | null | undefined) => void;
}

export function useAudio(
  initialAudioPath?: string | null,
  onAudioEnded?: () => void,
  playbackKey?: string
): UseAudioReturn {
  const [audioPath, setAudioPath] = useState(initialAudioPath);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const signedUrlRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const playCleanupRef = useRef<(() => void) | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);

  const cancelPlayback = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    playCleanupRef.current?.();
    playCleanupRef.current = null;
    activeAudioRef.current = null;
  }, []);

  useEffect(() => {
    setAudioPath(initialAudioPath);
  }, [initialAudioPath, playbackKey]);

  useEffect(() => {
    const audio = audioRef.current;
    cancelPlayback();
    signedUrlRef.current = null;
    setIsPlaying(false);
    setIsLoading(false);

    return () => {
      cancelPlayback();
      // Capture this element: the ref may already point at the next page's audio.
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    };
  }, [audioPath, initialAudioPath, playbackKey, cancelPlayback]);

  const onEnded = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || activeAudioRef.current !== audio) return;
    cancelPlayback();
    setIsPlaying(false);
    setIsLoading(false);
    onAudioEnded?.();
  }, [cancelPlayback, onAudioEnded]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, [onEnded, audioPath, playbackKey]);

  const playAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioPath) return;

    cancelPlayback();
    const generation = generationRef.current;
    const isCurrent = () => generationRef.current === generation && audioRef.current === audio;
    const controller = new AbortController();
    requestRef.current = controller;
    setIsLoading(true);

    try {
      let url = signedUrlRef.current;
      if (!url) {
        const token = await auth.currentUser?.getIdToken();
        if (!isCurrent()) return;
        if (!token) throw new Error('Not authenticated');

        const response = await fetch('/api/get-signed-audio-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ audioPath }),
          signal: controller.signal,
        });
        if (!isCurrent()) return;
        if (!response.ok) throw new Error('Failed to fetch signed URL');
        const data: unknown = await response.json();
        if (!isCurrent()) return;
        if (!data || typeof data !== 'object' || !('signedUrl' in data) || typeof data.signedUrl !== 'string') {
          throw new Error('Invalid signed audio URL response');
        }
        url = data.signedUrl;
        signedUrlRef.current = url;
      }

      if (!isCurrent()) return;
      requestRef.current = null;
      if (audio.src !== url) audio.src = url;
      activeAudioRef.current = audio;

      const handleCanPlay = () => {
        if (isCurrent()) setIsLoading(false);
      };
      const handleError = () => {
        if (!isCurrent()) return;
        cancelPlayback();
        setIsLoading(false);
        setIsPlaying(false);
      };
      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('error', handleError);
      playCleanupRef.current = () => {
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('error', handleError);
      };

      await audio.play();
      if (!isCurrent()) return;
      setIsLoading(false);
      setIsPlaying(true);
    } catch (error) {
      if (!isCurrent()) return;
      cancelPlayback();
      setIsLoading(false);
      setIsPlaying(false);
      console.error('Audio playback failed:', error);
    }
  }, [audioPath, cancelPlayback]);

  const pause = useCallback(() => {
    cancelPlayback();
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsLoading(false);
  }, [cancelPlayback]);

  const play = useCallback(() => {
    void playAudio();
  }, [playAudio]);
  const togglePlay = () => {
    if (isPlaying || isLoading) pause();
    else play();
  };

  const setAudioSource = (src: string | null | undefined) => {
    pause();
    setAudioPath(src);
  };

  return { audioRef, isPlaying, isLoading, togglePlay, play, pause, onEnded, setAudioSource };
}

export default useAudio;
