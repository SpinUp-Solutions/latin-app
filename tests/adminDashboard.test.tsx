import { act, fireEvent, render, screen } from '@testing-library/react';
import AdministrationPage from '@/src/app/admin/(shell)/page';

const makeAdminRequest = jest.fn();

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/hooks/useAdminApi', () => ({ useAdminApi: () => ({ makeAdminRequest }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('administration dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    makeAdminRequest.mockResolvedValue({ data: { updated: 3 } });
  });

  it('groups the available administration tools and omits the unfinished user-management card', () => {
    render(<AdministrationPage />);
    expect(screen.getByRole('heading', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Assessment' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'Vocabulary' })).not.toHaveLength(0);
    expect(screen.queryByRole('link', { name: 'Advanced Filters' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'System' })).toBeInTheDocument();
    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create New Lesson' })).toHaveAttribute('href', '/admin/lessons/create');
  });

  it('requires confirmation before a destructive migration runs', async () => {
    render(<AdministrationPage />);
    makeAdminRequest.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[0]);
    expect(makeAdminRequest).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run migration' }));
      await Promise.resolve();
    });
    expect(makeAdminRequest).toHaveBeenCalledWith('vocabulary-pools/backfill-search-tokens', { method: 'POST' });
  });
});
