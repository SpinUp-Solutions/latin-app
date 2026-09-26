import { act, renderHook } from '@testing-library/react';
import { useFeedbackUploads } from '@/src/hooks/useFeedbackUploads';

type Observer = { progress: (snapshot: { bytesTransferred: number; totalBytes: number }) => void; fail: () => void; done: () => void };
type MockTask = { path: string; contentType: string; observer: Observer; cancel: jest.Mock };
const mockTasks: MockTask[] = [];

jest.mock('@/src/services/firebase', () => ({ auth: { currentUser: { uid: 'student-1' } }, storage: {} }));
jest.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => path,
  uploadBytesResumable: (path: string, _file: File, metadata: { contentType: string }) => {
    const task: MockTask = {
      path,
      contentType: metadata.contentType,
      observer: {} as Observer,
      cancel: jest.fn((): void => task.observer.fail()),
    };
    mockTasks.push(task);
    return {
      cancel: task.cancel,
      on: (_event: string, progress: Observer['progress'], fail: Observer['fail'], done: Observer['done']) => {
        task.observer = { progress, fail, done };
      },
    };
  },
}));

const draftId = 'a5361411-a326-4845-8465-259154c05e14';
const MB = 1024 * 1024;
const file = (name: string, type: string, size = 1024) => {
  const value = new File(['x'], name, { type });
  Object.defineProperty(value, 'size', { value: size });
  return value;
};

beforeEach(() => {
  mockTasks.length = 0;
  let uuid = 0;
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: () => `1be84684-3cec-4dd5-87f7-${String(++uuid).padStart(12, '0')}`,
  });
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
});

test('uploads accepted files into the student draft folder and reports progress', () => {
  const { result } = renderHook(() => useFeedbackUploads(draftId));
  let rejected: string[] = [];
  act(() => {
    rejected = result.current.addFiles([file('screen.png', 'image/png'), file('notes.pdf', 'application/pdf')]);
  });

  expect(rejected).toEqual(["notes.pdf isn't supported. Use PNG, JPG, WebP, MP4, WebM or MOV."]);
  expect(mockTasks.map(task => [task.path, task.contentType])).toEqual([
    [`student-feedback/uploads/student-1/${draftId}/1be84684-3cec-4dd5-87f7-000000000001`, 'image/png'],
  ]);
  expect(result.current.uploads[0]).toMatchObject({ name: 'screen.png', status: 'uploading', previewUrl: 'blob:preview' });
  expect(result.current.uploading).toBe(true);

  act(() => mockTasks[0].observer.progress({ bytesTransferred: 512, totalBytes: 1024 }));
  expect(result.current.uploads[0].progress).toBe(0.5);
  act(() => mockTasks[0].observer.done());
  expect(result.current.uploading).toBe(false);
  expect(result.current.ready).toEqual([{ id: '1be84684-3cec-4dd5-87f7-000000000001', name: 'screen.png' }]);
});

test('enforces per-file, count and total size limits', () => {
  const { result } = renderHook(() => useFeedbackUploads(draftId));
  let rejected: string[] = [];
  act(() => {
    rejected = result.current.addFiles([
      file('huge.png', 'image/png', 11 * MB),
      file('empty.png', 'image/png', 0),
      ...Array.from({ length: 6 }, (_, index) => file(`clip-${index}.mp4`, 'video/mp4', 45 * MB)),
    ]);
  });
  expect(rejected).toEqual([
    'huge.png is larger than 10 MB.',
    'empty.png is empty.',
    'Attachments can total at most 200 MB.',
    'Attachments can total at most 200 MB.',
  ]);
  expect(result.current.uploads).toHaveLength(4);

  act(() => {
    rejected = result.current.addFiles([file('a.png', 'image/png'), file('b.png', 'image/png')]);
  });
  expect(rejected).toEqual(['You can attach up to 5 files.']);
});

test('retries a failed upload at a fresh path and cancels uploads that are removed or reset', () => {
  const { result } = renderHook(() => useFeedbackUploads(draftId));
  act(() => {
    result.current.addFiles([file('a.png', 'image/png'), file('b.png', 'image/png')]);
  });
  act(() => mockTasks[0].observer.fail());
  expect(result.current.failed).toBe(true);

  const failedId = result.current.uploads[0].id;
  act(() => result.current.retry(failedId));
  expect(result.current.uploads[0]).toMatchObject({ status: 'uploading', progress: 0 });
  expect(result.current.uploads[0].id).not.toBe(failedId);
  expect(mockTasks[2].path).toContain(result.current.uploads[0].id);

  act(() => result.current.remove(result.current.uploads[1].id));
  expect(mockTasks[1].cancel).toHaveBeenCalled();
  expect(result.current.uploads.map(upload => upload.name)).toEqual(['a.png']);

  act(() => result.current.reset());
  expect(mockTasks[2].cancel).toHaveBeenCalled();
  expect(result.current.uploads).toEqual([]);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
