import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { VocabularyPoolDeletionChallenge, VocabularyPoolSummary } from '@/src/types/vocabulary-pool';

const mockPrepare = jest.fn();
const mockDelete = jest.fn();
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockFilters = {};
const pools: VocabularyPoolSummary[] = ['Source one', 'Source two'].map((name, i) => ({
  id: `pool-${i + 1}`,
  name,
  description: 'Source vocabulary',
  metadata: {
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'admin',
    updatedBy: 'admin',
    wordCount: 2,
    isActive: true,
    tags: [],
    difficulty: 'beginner',
  },
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));
jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/components/admin/shell', () => ({
  AdminPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  AdminPageHeader: () => <h1>Vocabulary Pools</h1>,
}));
jest.mock('@/src/components/ui/admin/vocabulary-pools/PoolFilters', () => ({ PoolFilters: () => null }));
jest.mock('@/src/hooks/useInfiniteScroll', () => ({ useInfiniteScroll: () => ({ current: null }) }));
jest.mock('@/src/store/hooks', () => ({ useAppSelector: () => mockFilters, useAppDispatch: () => jest.fn() }));
jest.mock('@/src/store/api/vocabularyPoolApi', () => ({
  useGetPoolsQuery: () => ({ data: { pools }, isLoading: false, isFetching: false }),
  useGetVocabularyPoolUsagesQuery: () => ({ data: { status: 'available', usagesByPoolId: {} }, isLoading: false }),
  usePreparePoolDeletionMutation: () => [(id: string) => ({ unwrap: () => mockPrepare(id) })],
  useDeletePoolMutation: () => [(input: unknown) => ({ unwrap: () => mockDelete(input) })],
  useDuplicatePoolMutation: () => [jest.fn()],
}));
// Exercise the real API error mapper without initializing Firebase auth.
jest.mock('@/src/services/firebase', () => ({ auth: {} }));
import VocabularyPoolsPage from '@/src/app/admin/(shell)/vocabulary-pools/page';

const challenge = (changes: Partial<VocabularyPoolDeletionChallenge> = {}): VocabularyPoolDeletionChallenge => ({
  token: 'confirmation',
  expiresAt: '2026-09-15T12:00:00Z',
  poolName: 'Source one',
  wordCount: 2,
  usageStatus: 'available',
  usages: [],
  ...changes,
});
const button = (name = 'Source one') => screen.getByRole('button', { name: `Delete ${name}` });

beforeEach(() => {
  jest.clearAllMocks();
  mockPrepare.mockResolvedValue(challenge());
  mockDelete.mockResolvedValue(undefined);
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test('a referenced-source rejection stays visible on its card even without a toast renderer', async () => {
  const message = 'Unlink this pool from its combined pools before deleting it.';
  mockPrepare.mockRejectedValue({ status: 409, data: { error: message, code: 'VOCABULARY_POOL_IN_USE' } });
  render(<VocabularyPoolsPage />);
  fireEvent.click(button());
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
  expect(button()).toHaveAccessibleDescription(`Pool was not deleted ${message}`);
  expect(button('Source two')).not.toHaveAttribute('aria-describedby');
  expect(mockToastError).toHaveBeenCalledWith(message);
  expect(mockDelete).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
  expect(button()).toBeEnabled();
});

test.each([
  { usageStatus: 'unavailable' as const, expected: 'Assignment checks are unavailable' },
  {
    usages: [{ id: 'parent', poolId: 'pool-1', kind: 'pool' as const, label: 'Combined pool' }],
    expected: 'Remove this pool from 1 saved assignment',
  },
])('shows a persistent warning for a blocked challenge: $expected', async ({ expected, ...changes }) => {
  mockPrepare.mockResolvedValue(challenge(changes));
  render(<VocabularyPoolsPage />);
  fireEvent.click(button());
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(expected));
  expect(mockDelete).not.toHaveBeenCalled();
  expect(button()).toBeEnabled();
});

test('a final delete failure is visible and clears when the next attempt succeeds', async () => {
  mockDelete.mockRejectedValueOnce({
    status: 409,
    data: { error: 'The assignments changed. Review them and try again.' },
  });
  render(<VocabularyPoolsPage />);
  fireEvent.click(button());
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The assignments changed'));
  fireEvent.click(button());
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Pool deleted successfully'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(mockDelete).toHaveBeenLastCalledWith({ poolId: 'pool-1', confirmationToken: 'confirmation' });
  expect(button()).toBeEnabled();
});

test('pending checks block repeated clicks only on that pool and preserve another pool error', async () => {
  let release: (value: VocabularyPoolDeletionChallenge) => void = () => undefined;
  mockPrepare.mockImplementation((id: string) =>
    id === 'pool-1'
      ? new Promise(resolve => {
          release = resolve;
        })
      : Promise.reject({ data: { error: 'Source two is assigned.' } })
  );
  render(<VocabularyPoolsPage />);
  fireEvent.click(button());
  fireEvent.click(button());
  expect(button()).toBeDisabled();
  expect(button()).toHaveAttribute('aria-busy', 'true');
  expect(button('Source two')).toBeEnabled();
  fireEvent.click(button('Source two'));
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Source two is assigned.'));
  expect(mockPrepare.mock.calls).toEqual([['pool-1'], ['pool-2']]);
  release(challenge());
  await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  expect(screen.getByRole('alert')).toHaveTextContent('Source two is assigned.');
  expect(button()).toBeEnabled();
});

test('canceling confirmation restores the delete action without showing an error', async () => {
  jest.mocked(window.confirm).mockReturnValue(false);
  render(<VocabularyPoolsPage />);
  fireEvent.click(button());
  await waitFor(() => expect(window.confirm).toHaveBeenCalled());
  expect(button()).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(mockDelete).not.toHaveBeenCalled();
});
