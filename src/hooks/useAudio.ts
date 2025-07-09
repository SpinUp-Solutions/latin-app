import { useState, useEffect, useRef, useCallback } from 'react';
import { auth } from '@/src/services/firebase';

interface UseAudioReturn {
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  isLoading: boolean;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  onEnded: () => void;
  setAudioSource: (src: string | null | undefined) => void;
}

export function useAudio(initialAudioPath?: string | null, onAudioEnded?: () => void): UseAudioReturn {
  const [audioPath, setAudioPath] = useState<string | null | undefined>(initialAudioPath);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // When the source path changes, clear the old signed URL
  useEffect(() => {
    setSignedUrl(null);
  }, [audioPath]);

  const getSignedUrl = useCallback(async () => {
    if (!audioPath) return null;

    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch('/api/get-signed-audio-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ audioPath }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch signed URL');
      }

      const data = await response.json();
      return data.signedUrl;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [audioPath]);

  const playAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    let url = signedUrl;
    if (!url) {
      const newSignedUrl = await getSignedUrl();
      if (newSignedUrl) {
        setSignedUrl(newSignedUrl);
        url = newSignedUrl;
      }
    }

    if (url) {
      if (audio.src !== url) {
        audio.src = url;
      }
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(error => {
            console.error('Audio play error:', error);
            setIsPlaying(false);
          });
      }
    }
  }, [signedUrl, getSignedUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      setIsPlaying(false);
      onAudioEnded?.();
    };

    const handleError = (e: Event) => console.error('Audio error', e);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [onAudioEnded]);

  const togglePlay = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      playAudio();
    }
  };

  const play = () => {
    playAudio();
  };

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const onEnded = () => {
    onAudioEnded?.();
  };

  const setAudioSource = (src: string | null | undefined) => {
    setAudioPath(src);
    setIsPlaying(false); // Stop playing when source changes
  };

  return {
    audioRef,
    isPlaying,
    isLoading,
    togglePlay,
    play,
    pause,
    onEnded,
    setAudioSource,
  };
}

export default useAudio;
