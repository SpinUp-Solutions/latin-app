import { act, renderHook, waitFor } from '@testing-library/react';
import { useFeedbackAttachments } from '@/src/hooks/useFeedbackAttachments';

jest.mock('@/src/services/firebase', () => ({
  auth: { currentUser: { uid: 'student-1', getIdToken: async () => 'test-token' } },
  storage: {},
}));

type UploadCallbacks = { progress: (snapshot: { bytesTransferred: number; totalBytes: number }) => void; error: (error: Error) => void; done: () => void };
const tasks: Array<{ callbacks?: UploadCallbacks; cancel: jest.Mock }> = [];
jest.mock('firebase/storage', () => ({
  ref: (_storage: unknown, path: string) => path,
  uploadBytesResumable: () => {
    const task = {
      callbacks: undefined as UploadCallbacks | undefined,
      cancel: jest.fn(() => { task.callbacks?.error(new Error('cancelled')); }),
      on: (_event: string, progress: UploadCallbacks['progress'], error: UploadCallbacks['error'], done: UploadCallbacks['done']) => {
        task.callbacks = { progress, error, done };
      },
    };
    tasks.push(task);
    return task;
  },
}));

const sessionId = '11111111-1111-4111-8111-111111111111';
const file = new File([new Uint8Array([1, 2, 3])], 'proof.png', { type: 'image/png' });

function response(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => data } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function reserveResponse(id: string) {
  return response({
    attachment: { id, originalName: file.name, contentType: file.type, sizeBytes: file.size, status: 'reserved' },
    stagingPath: `student-feedback/staging/student-1/${sessionId}/${id}`,
  }, 201);
}

beforeEach(() => {
  tasks.length = 0;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: jest.fn(() => '22222222-2222-4222-8222-222222222222') } });
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useFeedbackAttachments', () => {
  it('removes a reservation even when removal starts before the reserve response', async () => {
    const reserve = deferred<Response>();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (init.method === 'POST' && url.endsWith('/attachments')) return reserve.promise;
      if (init.method === 'DELETE') return Promise.resolve(response({ attachment: { status: 'cancelled' } }));
      throw new Error(`Unexpected ${init.method} ${url}`);
    });
    const hook = renderHook(() => useFeedbackAttachments({ sessionId, ensureSession: async () => undefined }));
    act(() => hook.result.current.addFiles([file]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const id = hook.result.current.items[0].id;
    let removal: Promise<void> | undefined;
    act(() => { removal = hook.result.current.remove(id); });
    await act(async () => { reserve.resolve(reserveResponse(id)); await removal; });
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'DELETE')).toBe(true);
    expect(hook.result.current.items).toHaveLength(0);
  });

  it('reconciles a lost reserve response on remove and treats absent server intent as removed', async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      init.method === 'POST'
        ? Promise.reject(new Error('reserve response lost'))
        : Promise.resolve(response({ error: 'not found', code: 'FEEDBACK_NOT_FOUND' }, 404))
    );
    const hook = renderHook(() => useFeedbackAttachments({ sessionId, ensureSession: async () => undefined }));
    act(() => hook.result.current.addFiles([file]));
    await waitFor(() => expect(hook.result.current.items[0].status).toBe('error'));
    await act(async () => hook.result.current.remove(hook.result.current.items[0].id));
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'DELETE')).toBe(true);
    expect(hook.result.current.items).toHaveLength(0);
  });

  it('waits for a pending finalize before removing the server reservation', async () => {
    const finalize = deferred<Response>();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.endsWith('/attachments')) return Promise.resolve(reserveResponse('22222222-2222-4222-8222-222222222222'));
      if (url.endsWith('/finalize')) return finalize.promise;
      if (init.method === 'DELETE') return Promise.resolve(response({ attachment: { status: 'cancelled' } }));
      throw new Error(`Unexpected ${url}`);
    });
    const hook = renderHook(() => useFeedbackAttachments({ sessionId, ensureSession: async () => undefined }));
    act(() => hook.result.current.addFiles([file]));
    await waitFor(() => expect(tasks).toHaveLength(1));
    await act(async () => tasks[0].callbacks?.done());
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/finalize'))).toBe(true));
    const id = hook.result.current.items[0].id;
    let removal: Promise<void> | undefined;
    act(() => { removal = hook.result.current.remove(id); });
    await act(async () => {
      finalize.resolve(response({ attachment: { id, originalName: file.name, contentType: file.type, sizeBytes: file.size, status: 'ready' } }));
      await removal;
    });
    expect(fetchMock.mock.calls.some(([, init]) => init.method === 'DELETE')).toBe(true);
    expect(hook.result.current.items).toHaveLength(0);
  });

  it('resets on a new session and rejects unsupported media before reserve', async () => {
    const reserve = deferred<Response>();
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockReturnValue(reserve.promise);
    const hook = renderHook(({ id }) => useFeedbackAttachments({ sessionId: id, ensureSession: async () => undefined }),
      { initialProps: { id: sessionId } });
    act(() => hook.result.current.addFiles([file]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    hook.rerender({ id: '33333333-3333-4333-8333-333333333333' });
    expect(hook.result.current.items).toHaveLength(0);
    await act(async () => reserve.resolve(reserveResponse('22222222-2222-4222-8222-222222222222')));
    expect(hook.result.current.items).toHaveLength(0);
    const unsupported = { name: 'malware.svg', type: 'image/svg+xml', size: 100 } as File;
    act(() => hook.result.current.addFiles([unsupported]));
    expect(hook.result.current.items[0].status).toBe('error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
