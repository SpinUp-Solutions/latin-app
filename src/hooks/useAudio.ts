import { useState, useEffect, useRef } from 'react';

interface UseAudioReturn {
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  onEnded: () => void;
  setAudioSource: (src: string | null | undefined) => void;
}

export function useAudio(initialAudioPath?: string | null, onAudioEnded?: () => void): UseAudioReturn {
  const [audioPath, setAudioPath] = useState<string | null | undefined>(initialAudioPath);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Effect to handle audio source changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // If we have an audio path, set it
    if (audioPath) {
      console.log(`Setting audio source: ${audioPath}`);
      audio.src = audioPath;

      // If audio was playing, try to continue playing
      if (isPlaying) {
        // Reset to the beginning
        audio.currentTime = 0;

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.error('Audio play error:', error);
            setIsPlaying(false);
          });
        }
      }
    } else {
      // No source, ensure audio is paused
      audio.pause();
    }
  }, [audioPath]);

  // Handle play/pause state changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioPath) return;

    if (isPlaying) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Audio play error:', error);
          setIsPlaying(false);
        });
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, audioPath]);

  // Set up event listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      console.log('Audio ended');
      setIsPlaying(false);
      if (onAudioEnded) {
        onAudioEnded();
      }
    };

    audio.addEventListener('ended', handleEnded);

    // Debug events
    const handleLoadedMetadata = () => console.log('Audio metadata loaded');
    const handleCanPlay = () => console.log('Audio can play');
    const handleError = (e: Event) => console.error('Audio error', e);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
    };
  }, [onAudioEnded]);

  const togglePlay = () => {
    console.log(`Toggle play: current=${isPlaying}, new=${!isPlaying}, source=${audioPath}`);
    setIsPlaying(!isPlaying);
  };

  const play = () => {
    console.log(`Play audio: ${audioPath}`);
    setIsPlaying(true);
  };

  const pause = () => {
    console.log('Pause audio');
    setIsPlaying(false);
  };

  const onEnded = () => {
    if (onAudioEnded) onAudioEnded();
  };

  const setAudioSource = (src: string | null | undefined) => {
    console.log(`Setting audio source from outside: ${src}`);
    setAudioPath(src);
  };

  return {
    audioRef,
    isPlaying,
    togglePlay,
    play,
    pause,
    onEnded,
    setAudioSource,
  };
}

export default useAudio;
