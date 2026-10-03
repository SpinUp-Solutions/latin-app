import { NextRequest } from 'next/server';
import { parseLessonAudioPath } from '@/src/lib/lesson-audio-path.server';

const mockFile = jest.fn(() => ({
  getSignedUrl: jest.fn(async () => ['https://example.test/signed']),
  delete: jest.fn(async () => undefined),
  save: jest.fn(async () => undefined),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {},
  adminStorage: { bucket: () => ({ file: mockFile, name: 'demo-latin-app.appspot.com' }) },
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async () => ({ uid: 'student-1' }) }) }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({ verifyAdminAccess: async () => ({ uid: 'admin-1' }) }));
jest.mock('@/src/lib/vocabulary-pools/sync-lock.server', () => ({
  runVocabularyContentStorageMutation: (_db: unknown, work: () => Promise<unknown>) => work(),
}));

import { POST as signAudio } from '@/src/app/api/get-signed-audio-url/route';
import { POST as deleteAudio } from '@/src/app/api/admin/delete-audio/route';
import { POST as uploadAudio } from '@/src/app/api/admin/upload-audio/route';

const bucket = 'demo-latin-app.appspot.com';
const url = (path: string) => `https://storage.googleapis.com/${bucket}/${path}`;

describe('lesson audio path isolation', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = bucket;
    mockFile.mockClear();
  });

  it('accepts canonical lesson audio while rejecting private media and encoded traversal', () => {
    expect(parseLessonAudioPath(url('lessons/lesson-1/content_audio/page-1.mp3'), bucket))
      .toBe('lessons/lesson-1/content_audio/page-1.mp3');
    // Uploads accept any audio/* file, so the extension must not decide whether it can be played or deleted.
    for (const extension of ['m4a', 'weba', 'mpeg', 'mpga', 'MP3']) {
      expect(parseLessonAudioPath(url(`lessons/lesson-1/content_audio/page-1.${extension}`), bucket))
        .toBe(`lessons/lesson-1/content_audio/page-1.${extension}`);
    }
    for (const path of [
      'student-feedback/private/session/file.mp4',
      'lessons/lesson-1/content_audio/%2e%2e%2fprivate.mp3',
      'lessons/lesson-1/content_audio/%252fprivate.mp3',
      'lessons/lesson-1/content_audio/..',
      'lessons/lesson-1/content_audio/',
      'lessons/lesson-1/content_audio/file.mp3?generation=1',
      'lessons/lesson-1/other/file.mp3',
    ]) {
      expect(parseLessonAudioPath(url(path), bucket)).toBeNull();
    }
  });

  it('keeps private feedback out of both signed audio access and admin audio deletion', async () => {
    const audioPath = url('student-feedback/private/session/file.mp4');
    const request = {
      headers: new Headers({ authorization: 'Bearer token' }),
      json: async () => ({ audioPath }),
    } as NextRequest;
    expect((await signAudio(request)).status).toBe(400);
    expect((await deleteAudio(request)).status).toBe(400);
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('stores only uploads that the signer and deleter can reach later', async () => {
    const upload = (fileName: string, contentItemId: string) => {
      const values: Record<string, unknown> = {
        file: { name: fileName, type: 'audio/webm', arrayBuffer: async () => new ArrayBuffer(4) },
        lessonId: 'lesson-1',
        contentItemId,
      };
      return uploadAudio({
        headers: new Headers({ authorization: 'Bearer token' }),
        formData: async () => ({ get: (key: string) => values[key] ?? null }),
      } as unknown as NextRequest);
    };

    const stored = await upload('recording.weba', 'text-1');
    expect(stored.status).toBe(200);
    const { audioPath } = await stored.json();
    expect(parseLessonAudioPath(audioPath, bucket)).toBe('lessons/lesson-1/content_audio/text-1.weba');

    mockFile.mockClear();
    expect((await upload('recording.mp3', '../../student-feedback/reports/x')).status).toBe(400);
    expect((await upload('voice memo', 'text-1')).status).toBe(400);
    expect(mockFile).not.toHaveBeenCalled();
  });
});
