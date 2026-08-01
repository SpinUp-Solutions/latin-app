import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[0]);
    expect(makeAdminRequest).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run migration' }));
      await Promise.resolve();
    });
    expect(makeAdminRequest).toHaveBeenCalledWith('vocabulary-pools/backfill-search-tokens', { method: 'POST' });
  });

  it('requires a Learning Path dry run and applies and verifies its exact manifest', async () => {
    const manifest = {
      migrationId: 'learning-path-20260731-120000',
      createdAt: '2026-07-31T12:00:00.000Z',
      sourceHash: 'a'.repeat(64),
      unitIds: ['lesson-1'],
      source: [{ unitId: 'lesson-1', liveOrder: 0 }],
    };
    makeAdminRequest
      .mockResolvedValueOnce({ manifest })
      .mockResolvedValueOnce({ applied: true, path: { revision: 1 } })
      .mockResolvedValueOnce({ verified: true, path: { revision: 1 } });

    render(<AdministrationPage />);
    const runButton = screen.getByRole('button', { name: 'Run Learning Path migration' });
    expect(runButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Dry run Learning Path migration' }));
    await waitFor(() => expect(makeAdminRequest).toHaveBeenCalledTimes(1));
    const dryRunCall = makeAdminRequest.mock.calls[0];
    expect(dryRunCall[0]).toBe('learning-path/migration');
    expect(dryRunCall[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(dryRunCall[1].body)).toMatchObject({
      action: 'dry-run',
      migrationId: expect.stringMatching(/^learning-path-\d{8}-\d{6}$/),
    });
    expect(runButton).toBeEnabled();
    expect(screen.getByText(new RegExp(manifest.migrationId))).toBeInTheDocument();

    fireEvent.click(runButton);
    expect(makeAdminRequest).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Apply and verify' }));

    await waitFor(() => expect(makeAdminRequest).toHaveBeenCalledTimes(3));
    expect(makeAdminRequest).toHaveBeenNthCalledWith(2, 'learning-path/migration', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply', manifest }),
    });
    expect(makeAdminRequest).toHaveBeenNthCalledWith(3, 'learning-path/migration', {
      method: 'POST',
      body: JSON.stringify({ action: 'verify', manifest }),
    });
    expect(screen.getByText(/"verified": true/)).toBeInTheDocument();
  });
});
