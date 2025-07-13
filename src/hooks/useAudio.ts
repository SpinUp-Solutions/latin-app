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

  useEffect(() => {
    setSignedUrl(null);
  }, [audioPath]);

  const getSignedUrl = useCallback(async () => {
    if (!audioPath) {
      console.log('No audioPath provided');
      return null;
    }

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
        console.error('Failed to fetch signed URL:', response.status, response.statusText);
        throw new Error('Failed to fetch signed URL');
      }

      const data = await response.json();
      return data.signedUrl;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      return null;
    }
  }, [audioPath]);

  const playAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) {
      console.log('No audio element found');
      return;
    }

    // Start loading state
    setIsLoading(true);

    let url = signedUrl;
    console.log('Current signed URL:', url);
    if (!url) {
      console.log('Getting new signed URL...');
      const newSignedUrl = await getSignedUrl();
      if (newSignedUrl) {
        setSignedUrl(newSignedUrl);
        url = newSignedUrl;
        console.log('New signed URL set:', url);
      } else {
        console.log('Failed to get signed URL');
        setIsLoading(false);
        return;
      }
    }

    if (url) {
      console.log('Setting audio source and playing:', url);
      if (audio.src !== url) {
        audio.src = url;
        console.log('Audio source updated');
      }

      const handleCanPlay = () => {
        console.log('Audio can play, stopping loading');
        setIsLoading(false);
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('error', handleLoadError);
      };

      const handleLoadError = (e: Event) => {
        console.error('Audio load error:', e);
        setIsLoading(false);
        setIsPlaying(false);
        audio.removeEventListener('canplay', handleCanPlay);
        audio.removeEventListener('error', handleLoadError);
      };

      audio.addEventListener('canplay', handleCanPlay);
      audio.addEventListener('error', handleLoadError);

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Audio playing successfully');
            setIsPlaying(true);
          })
          .catch(error => {
            console.error('Audio play error:', error);
            setIsPlaying(false);
            setIsLoading(false);
          });
      }
    } else {
      console.log('No URL available to play');
      setIsLoading(false);
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
    setIsPlaying(false);
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
