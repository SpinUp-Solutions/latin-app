const LESSON_AUDIO_PATH =
  /^lessons\/[A-Za-z0-9_-]{1,200}\/content_audio\/[A-Za-z0-9._~-]{0,250}\.(mp3|m4a|wav|wave|ogg|oga|opus|aac|flac|aif|aiff|caf|wma|webm|mp4)$/i;

/**
 * Returns the object path of a lesson-audio URL in this bucket, or null. The audio signer and
 * deleter use it so they cannot reach other objects in the bucket, such as feedback attachments.
 */
export function parseLessonAudioPath(audioPath: unknown, bucketName: string): string | null {
  if (typeof audioPath !== 'string' || !bucketName) return null;
  const prefix = `https://storage.googleapis.com/${bucketName}/`;
  if (!audioPath.startsWith(prefix)) return null;
  try {
    const decoded = decodeURIComponent(audioPath.slice(prefix.length));
    return LESSON_AUDIO_PATH.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
