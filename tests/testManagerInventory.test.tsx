import { fireEvent, render, screen } from '@testing-library/react';
import { TestManager } from '@/src/components/ui/admin/TestManager';

const testsQuery = jest.fn();
const mocksQuery = jest.fn();
const pathQuery = jest.fn();
jest.mock('@/src/store/api/testApi', () => ({ useGetTestsQuery: () => testsQuery() }));
jest.mock('@/src/store/api/mockTestApi', () => ({ useGetMocksQuery: () => mocksQuery() }));
jest.mock('@/src/store/api/lessonApi', () => ({ useGetLearningPathQuery: () => pathQuery() }));

const test = {
  id: 'test-1',
  title: 'Chapter Test',
  description: 'Chapters',
  rotationVersionCount: 2,
  minTotalPoints: 10,
  maxTotalPoints: 20,
  passingPercentage: 70,
  updatedAt: '2026-01-01',
};
const mock = (overrides: Record<string, unknown>) => ({
  id: 'mock',
  title: 'Practice',
  description: '',
  status: 'active' as const,
  isLive: false,
  mockOrder: null,
  totalPoints: 25,
  passingPercentage: null,
  versionId: 'v1',
  parent: { kind: 'standalone' as const },
  updatedAt: '2026-01-02',
  ...overrides,
});
const linkedMock = mock({
  id: 'mock-linked',
  title: 'Chapter rehearsal',
  isLive: true,
  mockOrder: 0,
  parent: { kind: 'test', testId: 'test-1' },
});
const archivedMock = mock({ id: 'mock-archived', title: 'Moved standalone', status: 'archived' });

describe('test inventory', () => {
  const refetchTests = jest.fn();
  const refetchMocks = jest.fn();
  const refetchPath = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    testsQuery.mockReturnValue({ data: [test], isLoading: false, isError: false, refetch: refetchTests });
    mocksQuery.mockReturnValue({
      data: [linkedMock, archivedMock],
      isLoading: false,
      isError: false,
      refetch: refetchMocks,
    });
    pathQuery.mockReturnValue({
      data: { effectiveUnitIds: ['test-1'] },
      isLoading: false,
      isError: false,
      refetch: refetchPath,
    });
  });

  it('waits for canonical Learning Path placement before rendering inventory labels', () => {
    pathQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: refetchPath });
    render(<TestManager />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading test inventory and Learning Path placement');
    expect(screen.queryByText('In Learning Path')).not.toBeInTheDocument();
    expect(screen.queryByText('Unplaced')).not.toBeInTheDocument();
  });

  it('fails closed on canonical placement errors and retries every inventory source', () => {
    pathQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: refetchPath });
    render(<TestManager />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load the test inventory and canonical Learning Path placement.'
    );
    expect(screen.queryByText('In Learning Path')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading inventory' }));
    expect(refetchTests).toHaveBeenCalledTimes(1);
    expect(refetchMocks).toHaveBeenCalledTimes(1);
    expect(refetchPath).toHaveBeenCalledTimes(1);
  });

  it('keeps mock cards in their dedicated inventory while retaining linked-mock counts', () => {
    render(<TestManager />);
    expect(screen.getAllByText('In Learning Path')).not.toHaveLength(0);
    expect(screen.queryByText('Chapter rehearsal')).not.toBeInTheDocument();
    expect(screen.queryByText('Moved standalone')).not.toBeInTheDocument();
    expect(screen.getByText('1 active mock')).toBeInTheDocument();
  });

  it('filters by canonical placement and resets an empty search view', () => {
    render(<TestManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Unplaced' }));
    expect(screen.queryByText('Chapter Test')).not.toBeInTheDocument();
    expect(screen.getByText(/No tests match this view/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    expect(screen.getByText('Chapter Test')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: 'missing' } });
    expect(screen.getByText(/No tests match this view/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear test search' }));
    expect(screen.getByText('Chapter Test')).toBeInTheDocument();
  });
});
