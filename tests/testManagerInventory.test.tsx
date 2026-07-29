import { fireEvent, render, screen } from '@testing-library/react';
import { TestManager } from '@/src/components/ui/admin/TestManager';

const testsQuery = jest.fn(); const mocksQuery = jest.fn(); const pathQuery = jest.fn();
jest.mock('@/src/store/api/testApi', () => ({ useGetTestsQuery: () => testsQuery() }));
jest.mock('@/src/store/api/mockTestApi', () => ({ useGetMocksQuery: () => mocksQuery() }));
jest.mock('@/src/store/api/lessonApi', () => ({ useGetLearningPathQuery: () => pathQuery() }));

const test = { id: 'test-1', title: 'Chapter Test', description: 'Chapters', rotationVersionCount: 2, minTotalPoints: 10, maxTotalPoints: 20, passingPercentage: 70, updatedAt: '2026-01-01' };
const activeLinkedMock = { id: 'mock-linked', title: 'Chapter rehearsal', description: '', status: 'active' as const, isLive: true, mockOrder: 0, totalPoints: 25, passingPercentage: null, versionId: 'v1', parent: { kind: 'test' as const, testId: 'test-1' }, updatedAt: '2026-01-02' };
const activeStandaloneMock = { id: 'mock-standalone', title: 'Practice', description: '', status: 'active' as const, isLive: false, mockOrder: null, totalPoints: 25, passingPercentage: null, versionId: 'v2', parent: { kind: 'standalone' as const }, updatedAt: '2026-01-02' };
const archivedLinkedMock = { ...activeLinkedMock, id: 'archived-linked', title: 'Returned rehearsal', status: 'archived' as const, isLive: false };
const archivedStandaloneMock = { ...activeStandaloneMock, id: 'archived-standalone', title: 'Moved standalone', status: 'archived' as const };

describe('test inventory', () => {
  const refetchTests = jest.fn(); const refetchMocks = jest.fn(); const refetchPath = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    testsQuery.mockReturnValue({ data: [test], isLoading: false, isError: false, refetch: refetchTests });
    mocksQuery.mockReturnValue({ data: [activeLinkedMock, activeStandaloneMock, archivedLinkedMock, archivedStandaloneMock], isLoading: false, isError: false, refetch: refetchMocks });
    pathQuery.mockReturnValue({ data: { effectiveUnitIds: ['test-1'] }, isLoading: false, isError: false, refetch: refetchPath });
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
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the test inventory and canonical Learning Path placement.');
    expect(screen.queryByText('In Learning Path')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading inventory' }));
    expect(refetchTests).toHaveBeenCalledTimes(1);
    expect(refetchMocks).toHaveBeenCalledTimes(1);
    expect(refetchPath).toHaveBeenCalledTimes(1);
  });

  it('renders canonical placement and active linked-mock counts once every source is ready', () => {
    render(<TestManager />);
    expect(screen.getAllByText('In Learning Path')).not.toHaveLength(0);
    expect(screen.getByText('1 active linked mock')).toBeInTheDocument();
  });

  it('distinguishes returned parent assignments from archived standalone ownership', () => {
    render(<TestManager />);
    expect(screen.getByText('Assignment ended — back in parent rotation')).toBeInTheDocument();
    expect(screen.getByText('Archived standalone — version may be unowned or in normal rotation')).toBeInTheDocument();
  });

  it('filters and searches normal and mock inventory cards', () => {
    render(<TestManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Live mocks' }));
    expect(screen.getByText('Chapter rehearsal')).toBeInTheDocument();
    expect(screen.queryByText('Chapter Test')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archived mocks' }));
    expect(screen.getByText('Returned rehearsal')).toBeInTheDocument();
    expect(screen.getByText('Moved standalone')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: 'chapter' } });
    expect(screen.getByText(/No tests match this view/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Chapter Test')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search tests' }), { target: { value: 'chapter test' } });
    expect(screen.getByText('Chapter Test')).toBeInTheDocument();
  });
});
