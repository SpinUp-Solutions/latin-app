import { NextRequest } from 'next/server';
import { parseLegacyLessonAudioPath } from '@/src/lib/student-feedback/legacy-audio-path.server';

const mockFile = jest.fn(() => ({
  getSignedUrl: jest.fn(async () => ['https://example.test/signed']),
  delete: jest.fn(async () => undefined),
}));
jest.mock('@/src/services/firebase-admin', () => ({
  adminDb: {},
  adminStorage: { bucket: () => ({ file: mockFile }) },
}));
jest.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken: async () => ({ uid: 'student-1' }) }) }));
jest.mock('@/src/lib/verifyAdminAccess', () => ({ verifyAdminAccess: async () => ({ uid: 'admin-1' }) }));
jest.mock('@/src/lib/vocabulary-pools/sync-lock.server', () => ({
  runVocabularyContentStorageMutation: (_db: unknown, work: () => Promise<unknown>) => work(),
}));

import { POST as signAudio } from '@/src/app/api/get-signed-audio-url/route';
import { POST as deleteAudio } from '@/src/app/api/admin/delete-audio/route';

const bucket = 'demo-latin-app.appspot.com';
const url = (path: string) => `https://storage.googleapis.com/${bucket}/${path}`;

describe('legacy audio namespace isolation', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = bucket;
    mockFile.mockClear();
  });

  it('accepts canonical lesson audio while rejecting private media and encoded traversal', () => {
    expect(parseLegacyLessonAudioPath(url('lessons/lesson-1/content_audio/page-1.mp3'), bucket))
      .toBe('lessons/lesson-1/content_audio/page-1.mp3');
    expect(parseLegacyLessonAudioPath(url('lessons/lesson-1/content_audio/page-1.m4a'), bucket))
      .toBe('lessons/lesson-1/content_audio/page-1.m4a');
    for (const path of [
      'student-feedback/private/session/file.mp4',
      'lessons/lesson-1/content_audio/%2e%2e%2fprivate.mp3',
      'lessons/lesson-1/content_audio/%252fprivate.mp3',
      'lessons/lesson-1/content_audio/file.exe',
      'lessons/lesson-1/content_audio/file.mp3?generation=1',
      'lessons/lesson-1/other/file.mp3',
    ]) {
      expect(parseLegacyLessonAudioPath(url(path), bucket)).toBeNull();
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
});
