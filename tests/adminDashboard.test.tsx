import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdministrationPage from '@/src/app/admin/(shell)/page';

const makeAdminRequest = jest.fn();

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/hooks/useAdminApi', () => ({ useAdminApi: () => ({ makeAdminRequest }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe('administration dashboard', () => {
  const emptyWorkflow = { path: null, migration: null, needsRecovery: false };

  beforeEach(() => {
    jest.clearAllMocks();
    makeAdminRequest.mockImplementation(async (endpoint: string, options?: RequestInit) => {
      if (endpoint === 'learning-path/migration' && !options) return emptyWorkflow;
      return { data: { updated: 3 } };
    });
  });

  it('groups the available administration tools and omits the unfinished user-management card', async () => {
    render(<AdministrationPage />);
    await waitFor(() => expect(makeAdminRequest).toHaveBeenCalledWith('learning-path/migration'));
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
    await waitFor(() => expect(makeAdminRequest).toHaveBeenCalledWith('learning-path/migration'));
    makeAdminRequest.mockClear();
    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[0]);
    expect(makeAdminRequest).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run migration' }));
      await Promise.resolve();
    });
    expect(makeAdminRequest).toHaveBeenCalledWith('vocabulary-pools/backfill-search-tokens', { method: 'POST' });
  });

  it('persists a prepared manifest and applies and verifies by migration ID', async () => {
    const manifest = {
      migrationId: 'learning-path-20260731-120000',
      createdAt: '2026-07-31T12:00:00.000Z',
      sourceHash: 'a'.repeat(64),
      unitIds: ['lesson-1'],
      source: [{ unitId: 'lesson-1', liveOrder: 0 }],
    };
    const preparedMigration = {
      id: manifest.migrationId,
      migrationId: manifest.migrationId,
      manifest,
      status: 'prepared',
      createdAt: manifest.createdAt,
      createdBy: 'admin-1',
      updatedAt: manifest.createdAt,
      updatedBy: 'admin-1',
      events: [{ action: 'prepared', at: manifest.createdAt, by: 'admin-1' }],
    };
    const preparedWorkflow = { path: null, migration: preparedMigration, needsRecovery: false };
    const activeWorkflow = {
      path: {
        id: 'default',
        revision: 1,
        unitIds: ['lesson-1'],
        updatedAt: 'now',
        updatedBy: 'admin-1',
        cutover: {
          state: 'active',
          migrationId: manifest.migrationId,
          sourceHash: manifest.sourceHash,
          appliedAt: 'now',
          appliedBy: 'admin-1',
        },
      },
      migration: {
        ...preparedMigration,
        status: 'verified',
        events: [
          ...preparedMigration.events,
          { action: 'applied', at: 'now', by: 'admin-1', pathRevision: 1 },
          { action: 'verified', at: 'now', by: 'admin-1', pathRevision: 1 },
        ],
      },
      needsRecovery: false,
    };

    makeAdminRequest
      .mockResolvedValueOnce(emptyWorkflow)
      .mockResolvedValueOnce({ manifest, migration: preparedMigration, workflow: preparedWorkflow })
      .mockResolvedValueOnce({ applied: true, path: activeWorkflow.path, workflow: activeWorkflow })
      .mockResolvedValueOnce({ verified: true, path: activeWorkflow.path, workflow: activeWorkflow });

    render(<AdministrationPage />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Prepare Learning Path migration' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Prepare Learning Path migration' }));
    await waitFor(() => expect(makeAdminRequest).toHaveBeenCalledTimes(2));
    const dryRunCall = makeAdminRequest.mock.calls[1];
    expect(dryRunCall[0]).toBe('learning-path/migration');
    expect(dryRunCall[1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(dryRunCall[1].body)).toMatchObject({
      action: 'dry-run',
      migrationId: expect.stringMatching(/^learning-path-\d{8}-\d{6}$/),
    });
    await waitFor(() => expect(screen.getByText(manifest.migrationId)).toBeInTheDocument());
    const runButton = screen.getByRole('button', { name: 'Apply and verify' });

    fireEvent.click(runButton);
    expect(makeAdminRequest).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Apply and verify' }));

    await waitFor(() => expect(makeAdminRequest).toHaveBeenCalledTimes(4));
    expect(makeAdminRequest).toHaveBeenNthCalledWith(3, 'learning-path/migration', {
      method: 'POST',
      body: JSON.stringify({ action: 'apply', migrationId: manifest.migrationId }),
    });
    expect(makeAdminRequest).toHaveBeenNthCalledWith(4, 'learning-path/migration', {
      method: 'POST',
      body: JSON.stringify({ action: 'verify', migrationId: manifest.migrationId }),
    });
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retire fallback' })).toBeEnabled();
  });

  it('resumes an active pre-record migration through recovery after refresh', async () => {
    makeAdminRequest.mockResolvedValueOnce({
      path: {
        id: 'default',
        revision: 1,
        unitIds: ['lesson-1'],
        updatedAt: 'now',
        updatedBy: 'admin-1',
        cutover: {
          state: 'active',
          migrationId: 'migration-legacy',
          sourceHash: 'a'.repeat(64),
          appliedAt: 'now',
          appliedBy: 'admin-1',
        },
      },
      migration: null,
      needsRecovery: true,
    });

    render(<AdministrationPage />);
    expect(await screen.findByRole('button', { name: 'Recover active migration' })).toBeEnabled();
  });
});
