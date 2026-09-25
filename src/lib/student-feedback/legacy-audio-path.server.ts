const AUDIO_EXTENSIONS = new Set([
  'mp3', 'm4a', 'wav', 'wave', 'ogg', 'oga', 'opus', 'aac', 'flac', 'aif', 'aiff', 'caf', 'wma', 'webm', 'mp4',
]);

/** Restricts the legacy signer/deleter to the lesson-audio namespace. */
export function parseLegacyLessonAudioPath(audioPath: unknown, bucketName: string): string | null {
  if (typeof audioPath !== 'string' || !bucketName) return null;
  const prefix = `https://storage.googleapis.com/${bucketName}/`;
  if (!audioPath.startsWith(prefix)) return null;
  const encoded = audioPath.slice(prefix.length);
  if (/[?#]/.test(encoded)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  if (decoded.includes('%') || decoded.includes('\\') || decoded.includes('\0')) return null;
  const parts = decoded.split('/');
  if (parts.length !== 4 || parts[0] !== 'lessons' || parts[2] !== 'content_audio') return null;
  const [, lessonId, , fileName] = parts;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(lessonId)) return null;
  if (!/^[A-Za-z0-9._~-]{1,255}$/.test(fileName) || fileName === '.' || fileName === '..') return null;
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension || !AUDIO_EXTENSIONS.has(extension)) return null;
  return decoded;
}
