import React, { Suspense } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import type { VocabularyPoolWithWords } from '@/src/types/vocabulary-pool';

const mockBaseQuery = jest.fn();
const mockPush = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mockSuccess(...args), error: (...args: unknown[]) => mockError(...args) },
}));
jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/components/admin/shell', () => ({
  AdminPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AdminPageHeader: () => <h1>Edit Vocabulary Pool</h1>,
}));
jest.mock('@/src/hooks/useInfiniteScroll', () => ({ useInfiniteScroll: () => ({ current: null }) }));
jest.mock('@/src/store/api/baseQuery', () => ({
  ...jest.requireActual('@/src/store/api/baseQuery'),
  createAuthenticatedBaseQuery:
    () =>
    (...args: unknown[]) =>
      mockBaseQuery(...args),
}));
import EditPoolPage from '@/src/app/admin/(shell)/vocabulary-pools/[poolId]/edit/page';
import { vocabularyPoolApi } from '@/src/store/api/vocabularyPoolApi';
import vocabularyPools from '@/src/store/slices/vocabularyPoolSlice';

const metadata = {
  createdAt: '2026-09-15T00:00:00Z' as unknown as Date,
  updatedAt: '2026-09-15T00:00:00Z' as unknown as Date,
  createdBy: 'admin',
  updatedBy: 'admin',
  wordCount: 2,
  isActive: true,
  tags: [],
  difficulty: 'beginner' as const,
};
const source = { id: 'source', name: 'Source pool', description: 'Source words', metadata };
const createStore = () =>
  configureStore({
    reducer: { vocabularyPools, [vocabularyPoolApi.reducerPath]: vocabularyPoolApi.reducer },
    middleware: getDefault => getDefault().concat(vocabularyPoolApi.middleware),
  });
let savedPool: VocabularyPoolWithWords;
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
beforeEach(() => {
  jest.clearAllMocks();
  savedPool = {
    id: 'combined',
    name: 'Combined pool',
    description: 'Linked words',
    metadata,
    sourcePoolIds: ['source'],
    directWordDocIds: ['own'],
    inheritedWordDocIds: ['inherited'],
    sources: [{ id: 'source', name: 'Source pool' }],
    wordDocIds: ['inherited', 'own'],
    words: [],
  };
  mockBaseQuery.mockImplementation(
    async (request: string | { method: string; body: Partial<VocabularyPoolWithWords> }) => {
      if (typeof request !== 'string') {
        savedPool = { ...savedPool, ...request.body };
        return { data: { success: true, data: { pool: savedPool } } };
      }
      if (request === '/admin/vocabulary-pools/combined') return { data: { success: true, data: { pool: savedPool } } };
      if (request.startsWith('/admin/vocabulary-pools?'))
        return { data: { success: true, data: { pools: [source], hasMore: false, lastPoolId: null } } };
      return { data: { success: true, data: { words: [], hasMore: false, lastWordId: null } } };
    }
  );
});

test.each(['remove button', 'checkbox', 'card'])(
  'unlinking with the %s survives saving and reopening the editor',
  async method => {
    const store = createStore();
    const params = Promise.resolve({ poolId: 'combined' });
    const page = (store: ReturnType<typeof createStore>) => (
      <Provider store={store}>
        <Suspense fallback={null}>
          <EditPoolPage params={params} />
        </Suspense>
      </Provider>
    );
    let editor: ReturnType<typeof render>;
    await act(async () => {
      editor = render(page(store));
    });
    await screen.findByRole('button', { name: 'Remove Source pool' });
    if (method === 'remove button') fireEvent.click(screen.getByRole('button', { name: 'Remove Source pool' }));
    else if (method === 'checkbox') fireEvent.click(screen.getByRole('checkbox', { name: 'Select Source pool' }));
    else fireEvent.click(screen.getByText('Source words'));
    expect(screen.getByRole('checkbox', { name: 'Select Source pool' })).not.toBeChecked();
    expect(screen.queryByText('Selected pools (1)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mockSuccess).toHaveBeenCalled());
    expect(mockBaseQuery.mock.calls.map(([request]) => request)).toContainEqual(
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({ sourcePoolIds: [], directWordDocIds: ['own'] }),
      })
    );
    expect(savedPool.sourcePoolIds).toEqual([]);
    editor!.unmount();
    store.dispatch(vocabularyPoolApi.util.resetApiState());
    const reloadedStore = createStore();
    await act(async () => {
      editor = render(page(reloadedStore));
    });
    expect(await screen.findByRole('checkbox', { name: 'Select Source pool' })).not.toBeChecked();
    editor!.unmount();
    reloadedStore.dispatch(vocabularyPoolApi.util.resetApiState());
  }
);
