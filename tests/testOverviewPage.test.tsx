import { act, fireEvent, render, screen } from '@testing-library/react';
import TestOverviewPage from '@/src/app/admin/tests/edit/[id]/page';

const getTest = jest.fn();
const updateSettings = jest.fn();

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/components/ui/admin/MockAssignmentDialog', () => ({ MockAssignmentDialog: () => null }));
jest.mock('@/src/store/api/testApi', () => ({
  useGetTestByIdQuery: () => getTest(),
  useUpdateTestSettingsMutation: () => [updateSettings, { isLoading: false }],
}));

const version = { id: 'version-1', name: 'Rotation A', totalExercises: 4, totalPoints: 20, updatedAt: '2026-01-01' };
const mockVersion = { id: 'version-2', name: 'Mock A', totalExercises: 5, totalPoints: 25, updatedAt: '2026-01-02' };

const test = (passingPercentage: number | null = null) => ({
  id: 'test-1', kind: 'test', title: 'Chapter Test', description: '', passingPercentage,
  rotationVersions: [],
});

describe('normal test overview workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateSettings.mockReturnValue({ unwrap: () => Promise.resolve({ test: test() }) });
  });

  it('keeps rotation and parent-linked mock cards in their separate workflow groups', async () => {
    getTest.mockReturnValue({ data: { test: test(), versions: [version], mocks: [{ id: 'mock-1', title: 'Chapter rehearsal', isLive: true, passingPercentage: 80, version: mockVersion }] }, isLoading: false, isError: false });
    await act(async () => { render(<TestOverviewPage params={Promise.resolve({ id: 'test-1' })} />); await Promise.resolve(); });
    expect(screen.getByRole('heading', { name: 'In rotation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mock cards' })).toBeInTheDocument();
    expect(screen.getByText('Rotation A')).toBeInTheDocument();
    expect(screen.getByText('Mock A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Test Management' })).toHaveAttribute('href', '/admin/tests/manage');
    expect(screen.getByRole('link', { name: 'Edit mock-owned version' })).toHaveAttribute('href', '/admin/mock-tests/mock-1');
    expect(screen.getByText(/Pass ≥ 80% \(20\.0 of 25 points\)/)).toBeInTheDocument();
  });

  it('explains the valid empty-rotation state without hiding the mock workflow', async () => {
    getTest.mockReturnValue({ data: { test: test(70), versions: [], mocks: [{ id: 'mock-1', title: 'Chapter rehearsal', isLive: false, passingPercentage: null, version: mockVersion }] }, isLoading: false, isError: false });
    await act(async () => { render(<TestOverviewPage params={Promise.resolve({ id: 'test-1' })} />); await Promise.resolve(); });
    expect(screen.getByText(/No versions are currently in rotation/)).toBeInTheDocument();
    expect(screen.getByText('Mock A')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit mock-owned version' })).toHaveAttribute('href', '/admin/mock-tests/mock-1');
    expect(screen.getByText(/Excluded from rotation .* Score only/)).toBeInTheDocument();
  });

  it('persists zero-rotation container settings and resets its dirty baseline after success', async () => {
    getTest.mockReturnValue({ data: { test: test(), versions: [], mocks: [] }, isLoading: false, isError: false });
    await act(async () => { render(<TestOverviewPage params={Promise.resolve({ id: 'test-1' })} />); await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Revised Chapter Test' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save container settings' })); await Promise.resolve(); });
    expect(updateSettings).toHaveBeenCalledWith({ id: 'test-1', changes: { title: 'Revised Chapter Test', description: '', passingPercentage: null } });
    expect(screen.getByRole('status')).toHaveTextContent('Container settings saved');
    expect(screen.getByRole('button', { name: 'Save container settings' })).toBeDisabled();
  });

  it('surfaces mutation errors and can discard back to the last saved baseline', async () => {
    updateSettings.mockReturnValueOnce({ unwrap: () => Promise.reject({ data: { error: 'Revision conflict' } }) });
    getTest.mockReturnValue({ data: { test: test(), versions: [], mocks: [] }, isLoading: false, isError: false });
    await act(async () => { render(<TestOverviewPage params={Promise.resolve({ id: 'test-1' })} />); await Promise.resolve(); });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Unsaved' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save container settings' })); await Promise.resolve(); });
    expect(screen.getByRole('alert')).toHaveTextContent('Revision conflict');
    fireEvent.click(screen.getByRole('button', { name: 'Discard settings' }));
    expect(screen.getByLabelText('Title')).toHaveValue('Chapter Test');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
