import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import type { VocabularyPoolSummary } from '@/src/types/vocabulary-pool';

const mockGetPoolsQuery = jest.fn();
const mockQueryResponses = new Map<string, unknown>();

jest.mock('@/src/store/api/vocabularyPoolApi', () => ({
  useGetPoolsQuery: (...args: unknown[]) => mockGetPoolsQuery(...args),
}));
jest.mock('@/src/hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}));
jest.mock('@/src/hooks/useInfiniteScroll', () => ({
  useInfiniteScroll: () => null,
}));

import { VocabularyPoolImportSelector } from '@/src/components/ui/admin/vocabulary-pools/VocabularyPoolImportSelector';

const makePool = (id: string, name: string): VocabularyPoolSummary => ({
  id,
  name,
  description: `${name} description`,
  metadata: {
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: 'admin',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    updatedBy: 'admin',
    wordCount: 12,
    isActive: id !== 'inactive',
    tags: [],
    difficulty: 'beginner',
  },
});

const response = (pools: VocabularyPoolSummary[], lastPoolId: string | null, hasMore: boolean) => ({
  currentData: { pools, lastPoolId, hasMore },
  data: { pools, lastPoolId, hasMore },
  isLoading: false,
  isFetching: false,
  isError: false,
  error: undefined,
  refetch: jest.fn(),
});

function Harness() {
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>([]);
  return (
    <>
      <VocabularyPoolImportSelector selectedPoolIds={selectedPoolIds} onSelectionChange={setSelectedPoolIds} />
      <output data-testid="selected-ids">{selectedPoolIds.join(',')}</output>
    </>
  );
}

describe('VocabularyPoolImportSelector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryResponses.clear();
    mockGetPoolsQuery.mockImplementation((args: { filters: { search?: string }; lastPoolId: string | null }) => {
      const key = `${args.filters.search ?? ''}|${args.lastPoolId ?? ''}`;
      return mockQueryResponses.get(key) ?? response([], null, false);
    });
  });

  it('keeps selected pools across cursor pages and starts a new search at the first cursor', async () => {
    const firstPool = makePool('pool-a', 'Pool A');
    const secondPool = makePool('pool-b', 'Pool B');
    const searchPool = makePool('pool-c', 'Lesson Pool');
    mockQueryResponses.set('|', response([firstPool], 'cursor-a', true));
    mockQueryResponses.set('|cursor-a', response([secondPool], null, false));
    mockQueryResponses.set('lesson|', response([searchPool], null, false));

    render(<Harness />);
    expect(mockGetPoolsQuery.mock.calls[0][0]).toMatchObject({ lastPoolId: null });
    fireEvent.click(screen.getByText('Pool A'));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('pool-a');

    fireEvent.click(screen.getByRole('button', { name: 'Load more pools' }));
    await waitFor(() => expect(screen.getByText('Pool B')).toBeInTheDocument());
    expect(screen.getByText('Selected pools (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Pool B'));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('pool-a,pool-b');

    const search = screen.getByRole('textbox', { name: 'Search pools to import' });
    fireEvent.change(search, { target: { value: 'lesson' } });
    await waitFor(() => expect(screen.getByText('Lesson Pool')).toBeInTheDocument());
    const latestArgs = mockGetPoolsQuery.mock.calls.at(-1)?.[0] as {
      filters: { search?: string };
      lastPoolId: string | null;
    };
    expect(latestArgs.filters.search).toBe('lesson');
    expect(latestArgs.lastPoolId).toBeNull();
    expect(screen.getByText('Selected pools (2)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Pool A' }));
    expect(screen.getByTestId('selected-ids')).toHaveTextContent('pool-b');
  });

  it('offers retry on load errors and keeps a load-more action when a page has no visible complete pools', async () => {
    const refetch = jest.fn();
    mockGetPoolsQuery.mockReset();
    mockGetPoolsQuery.mockReturnValue({
      currentData: { pools: [], lastPoolId: 'filtered-cursor', hasMore: true },
      data: { pools: [], lastPoolId: 'filtered-cursor', hasMore: true },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch,
    });
    const { rerender } = render(<Harness />);
    expect(screen.getByRole('button', { name: 'Load more pools' })).toBeInTheDocument();

    mockGetPoolsQuery.mockReturnValue({
      currentData: undefined,
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: { data: { error: 'Pool list failed' } },
      refetch,
    });
    rerender(<Harness />);
    expect(screen.getByText('Pool list failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
