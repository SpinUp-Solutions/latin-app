import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MockTestManager } from '@/src/components/ui/admin/MockTestManager';

const getMocks = jest.fn();
const reorder = jest.fn();
const refetch = jest.fn();

jest.mock('@/src/store/api/mockTestApi', () => ({
  useGetMocksQuery: () => ({ ...getMocks(), refetch }),
  useReorderMocksMutation: () => [reorder, { isLoading: false, error: undefined }],
}));

const mock = (id: string, title: string, isLive: boolean, status: 'active' | 'archived' = 'active') => ({
  id, title, description: '', versionId: `${id}-version`, parent: { kind: 'standalone' as const }, passingPercentage: null,
  status, isLive, mockOrder: isLive ? Number(id.slice(-1)) : null, totalPoints: 20,
});

describe('MockTestManager', () => {
  beforeEach(() => { jest.clearAllMocks(); refetch.mockReturnValue({ unwrap: () => Promise.resolve({}) }); reorder.mockReturnValue({ unwrap: () => Promise.resolve({}) }); });

  it('makes lifecycle consequences explicit and separates live, hidden, and archived cards', () => {
    const archived = { ...mock('mock-3', 'Old mock', false, 'archived'), parent: { kind: 'test' as const, testId: 'test-1' } };
    getMocks.mockReturnValue({ data: [mock('mock-1', 'Live mock', true), mock('mock-2', 'Hidden mock', false), archived], isLoading: false, isError: false });
    render(<MockTestManager />);
    expect(screen.getByRole('heading', { name: 'Live mock cards' })).toBeInTheDocument();
    expect(screen.getByText('Live to students')).toBeInTheDocument();
    expect(screen.getByText('Hidden from students (still mock-only)')).toBeInTheDocument();
    expect(screen.getByText('Assignment ended — back in rotation')).toBeInTheDocument();
  });

  it('submits the complete live-card scope when ordering controls are used', async () => {
    getMocks.mockReturnValue({ data: [mock('mock-1', 'First', true), mock('mock-2', 'Second', true)], isLoading: false, isError: false });
    render(<MockTestManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Move First down' }));
    expect(reorder).toHaveBeenCalledWith({ mockIds: ['mock-2', 'mock-1'] });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move First down' })).not.toBeDisabled());
  });

  it('serializes rapid reorder input and refetches after a rejected save', async () => {
    let reject!: (reason: Error) => void;
    reorder.mockReturnValue({ unwrap: () => new Promise((_, fail) => { reject = fail; }) });
    getMocks.mockReturnValue({ data: [mock('mock-1', 'First', true), mock('mock-2', 'Second', true)], isLoading: false, isError: false });
    render(<MockTestManager />);
    const down = screen.getByRole('button', { name: 'Move First down' });
    fireEvent.click(down);
    fireEvent.click(down);
    expect(reorder).toHaveBeenCalledTimes(1);
    expect(down).toBeDisabled();
    await act(async () => { reject(new Error('conflict')); await Promise.resolve(); });
    await screen.findByRole('alert');
    await waitFor(() => expect(down).not.toBeDisabled());
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('current order has been restored');
  });

  it('has accessible loading, error, and empty states', () => {
    getMocks.mockReturnValue({ data: [], isLoading: true, isError: false });
    const view = render(<MockTestManager />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading mock tests');
    view.rerender(<MockTestManager />);
    getMocks.mockReturnValue({ data: [], isLoading: false, isError: true });
    view.rerender(<MockTestManager />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load mock tests');
    getMocks.mockReturnValue({ data: [], isLoading: false, isError: false });
    view.rerender(<MockTestManager />);
    expect(screen.getByText(/No mock tests yet/)).toBeInTheDocument();
  });
});
