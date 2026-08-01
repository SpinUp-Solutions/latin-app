import { act, fireEvent, render, screen } from '@testing-library/react';
import MockOverviewPage from '@/src/app/admin/(shell)/mock-tests/[mockId]/page';

const getMock = jest.fn();
const getVersion = jest.fn();
const push = jest.fn();
const refetchMock = jest.fn();
const refetchVersion = jest.fn();
let versionDirty = false;
const mutation = jest.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const versionEditor = jest.fn((_props: unknown) => <div>Version editor</div>);

jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/components/ui/admin', () => ({ TestVersionEditor: (props: unknown) => versionEditor(props) }));
jest.mock('@/src/components/ui/admin/test-version/TestVersionPreview', () => ({
  TestVersionPreview: () => <div>Version preview</div>,
}));
jest.mock('@/src/store/hooks', () => ({ useAppSelector: () => versionDirty }));
jest.mock('@/src/store/api/testApi', () => ({
  useGetTestVersionByIdQuery: () => getVersion(),
  useGetTestsQuery: () => ({
    data: [{ id: 'test-1', title: 'Target' }],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/src/store/api/mockTestApi', () => ({
  useGetMockQuery: () => getMock(),
  useUpdateMockMutation: () => [mutation, { isLoading: false }],
  useUpdateMockVersionMutation: () => [mutation, { isLoading: false }],
  useArchiveMockMutation: () => [mutation, { isLoading: false }],
  useReactivateStandaloneMockMutation: () => [mutation, { isLoading: false }],
  useMoveMockToTestMutation: () => [mutation, { isLoading: false }],
  useDuplicateMockIntoTestMutation: () => [mutation, { isLoading: false }],
}));

const mock = (title: string) => ({
  id: 'mock-1',
  title,
  description: '',
  passingPercentage: null,
  isLive: false,
  status: 'active' as const,
  mockOrder: null,
  versionId: 'version-a',
  parent: { kind: 'standalone' as const },
});
const renderPage = async () => {
  const params = Promise.resolve({ mockId: 'mock-1' });
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<MockOverviewPage params={params} />);
    await params;
  });
  return { params, view };
};

describe('mock overview dirty reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    versionDirty = false;
    getMock.mockReturnValue({ data: mock('Original'), isLoading: false, isError: false, refetch: refetchMock });
    getVersion.mockReturnValue({
      data: { id: 'version-a', name: 'A', pages: [], totalPages: 0, totalItems: 0, totalExercises: 0, totalPoints: 0 },
      isLoading: false,
      isError: false,
      refetch: refetchVersion,
    });
    mutation.mockImplementation(() => ({ unwrap: () => Promise.resolve({ mock: mock('Original') }) }));
  });

  it('does not overwrite dirty card settings when the mock query refetches', async () => {
    let view!: ReturnType<typeof render>;
    const params = Promise.resolve({ mockId: 'mock-1' });
    await act(async () => {
      view = render(<MockOverviewPage params={params} />);
      await params;
    });
    fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Local draft' } });
    getMock.mockReturnValue({ data: mock('Remote update'), isLoading: false, isError: false });
    view.rerender(<MockOverviewPage params={params} />);
    expect(screen.getByLabelText('Student-facing title')).toHaveValue('Local draft');
  });

  it('reconciles the latest refetched snapshot after explicit discard, including remote archive', async () => {
    const params = Promise.resolve({ mockId: 'mock-1' });
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<MockOverviewPage params={params} />);
      await params;
    });
    fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Local draft' } });
    getMock.mockReturnValue({
      data: { ...mock('Remote archived'), status: 'archived' },
      isLoading: false,
      isError: false,
    });
    view.rerender(<MockOverviewPage params={params} />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard card changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard card changes' }));
    expect(await screen.findByDisplayValue('Remote archived')).toBeDisabled();
  });

  it('defers the complete ownership snapshot while the version editor is dirty', async () => {
    versionDirty = true;
    const params = Promise.resolve({ mockId: 'mock-1' });
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<MockOverviewPage params={params} />);
      await params;
    });
    expect(screen.getByText('Version editor')).toBeInTheDocument();
    getMock.mockReturnValue({
      data: { ...mock('Moved remotely'), status: 'archived', parent: { kind: 'test' as const, testId: 'test-1' } },
      isLoading: false,
      isError: false,
    });
    view.rerender(<MockOverviewPage params={params} />);
    expect(screen.getByText('Version editor')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('newer server state is waiting');
    versionDirty = false;
    view.rerender(<MockOverviewPage params={params} />);
    expect(await screen.findByText('Version preview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View parent test' })).toBeInTheDocument();
  });

  it('normalizes local settings from the successful save response', async () => {
    mutation.mockImplementation(() => ({
      unwrap: () => Promise.resolve({ mock: { ...mock('Trimmed'), description: 'Clean' } }),
    }));
    const params = Promise.resolve({ mockId: 'mock-1' });
    await act(async () => {
      render(<MockOverviewPage params={params} />);
      await params;
    });
    fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: '  Trimmed  ' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '  Clean  ' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
      await Promise.resolve();
    });
    expect(screen.getByLabelText('Student-facing title')).toHaveValue('Trimmed');
    expect(screen.getByLabelText('Description')).toHaveValue('Clean');
    expect(screen.getByRole('button', { name: 'Archive assignment' })).not.toBeDisabled();
  });

  it('preserves newer card edits when a settings save finishes', async () => {
    let resolveSave!: (value: object | PromiseLike<object>) => void;
    mutation.mockImplementation(() => ({
      unwrap: () =>
        new Promise<object>(resolve => {
          resolveSave = resolve;
        }),
    }));
    await renderPage();

    fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Submitted title' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Newer local title' } });
    await act(async () => {
      resolveSave({ mock: mock('Submitted title') });
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Student-facing title')).toHaveValue('Newer local title');
    expect(screen.getByRole('button', { name: 'Discard card changes' })).toBeEnabled();
  });

  it.each([
    ['becomes dirty', false, true],
    ['becomes clean', true, false],
  ])(
    'uses current version dirtiness when a settings response arrives after the editor %s',
    async (_name, initiallyDirty, dirtyAtResponse) => {
      let resolveSave!: (value: object | PromiseLike<object>) => void;
      mutation.mockImplementation(() => ({
        unwrap: () =>
          new Promise<object>(resolve => {
            resolveSave = resolve;
          }),
      }));
      versionDirty = initiallyDirty;
      const params = Promise.resolve({ mockId: 'mock-1' });
      let view!: ReturnType<typeof render>;
      await act(async () => {
        view = render(<MockOverviewPage params={params} />);
        await params;
      });
      fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Saving' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
      versionDirty = dirtyAtResponse;
      view.rerender(<MockOverviewPage params={params} />);
      const archived = { ...mock('Saved remotely'), status: 'archived' as const };
      await act(async () => {
        resolveSave({ mock: archived });
        await Promise.resolve();
      });
      if (dirtyAtResponse) {
        expect(screen.getByText('Version editor')).toBeInTheDocument();
        versionDirty = false;
        view.rerender(<MockOverviewPage params={params} />);
        expect(await screen.findByText('Version preview')).toBeInTheDocument();
      } else {
        expect(await screen.findByText('Version preview')).toBeInTheDocument();
      }
    }
  );

  it.each([
    ['mock query with settings dirtiness', 'mock', false],
    ['version query with version dirtiness', 'version', true],
  ])('keeps cached editor state mounted after a background %s error', async (_name, failedQuery, nestedDirty) => {
    versionDirty = nestedDirty;
    const params = Promise.resolve({ mockId: 'mock-1' });
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(<MockOverviewPage params={params} />);
      await params;
    });
    if (!nestedDirty)
      fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Local settings' } });
    if (failedQuery === 'mock')
      getMock.mockReturnValue({ data: mock('Original'), isLoading: false, isError: true, refetch: refetchMock });
    else
      getVersion.mockReturnValue({
        data: {
          id: 'version-a',
          name: 'A',
          pages: [],
          totalPages: 0,
          totalItems: 0,
          totalExercises: 0,
          totalPoints: 0,
        },
        isLoading: false,
        isError: true,
        refetch: refetchVersion,
      });
    view.rerender(<MockOverviewPage params={params} />);
    expect(screen.getByText('Version editor')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('unsaved changes are preserved');
    if (!nestedDirty) expect(screen.getByLabelText('Student-facing title')).toHaveValue('Local settings');
    fireEvent.click(screen.getByRole('button', { name: 'Retry refresh' }));
    expect(failedQuery === 'mock' ? refetchMock : refetchVersion).toHaveBeenCalledTimes(1);
  });

  it('shows the fatal actionable state only when no cached mock/version data exists', async () => {
    getMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: refetchMock });
    getVersion.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: refetchVersion });
    const params = Promise.resolve({ mockId: 'mock-1' });
    await act(async () => {
      render(<MockOverviewPage params={params} />);
      await params;
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Retry from the Mock Tests page');
    expect(screen.queryByText('Version editor')).not.toBeInTheDocument();
  });

  it('blocks ownership changes for either card-setting or version dirtiness', async () => {
    const params = Promise.resolve({ mockId: 'mock-1' });
    await act(async () => {
      render(<MockOverviewPage params={params} />);
      await params;
    });
    fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Local draft' } });
    expect(screen.getByRole('button', { name: 'Archive assignment' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Target normal test'), { target: { value: 'test-1' } });
    expect(screen.getByRole('button', { name: 'Move and archive mock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Duplicate into rotation' })).toBeDisabled();
  });

  it.each([
    ['version-only', true, false],
    ['settings-only', false, true],
    ['combined', true, true],
  ])('uses one in-app navigation dialog for %s dirtiness', async (_name, nestedDirty, cardDirty) => {
    versionDirty = nestedDirty;
    const params = Promise.resolve({ mockId: 'mock-1' });
    await act(async () => {
      render(<MockOverviewPage params={params} />);
      await params;
    });
    if (cardDirty) fireEvent.change(screen.getByLabelText('Student-facing title'), { target: { value: 'Dirty' } });
    const navigationLink = document.createElement('a');
    navigationLink.href = '/admin/mock-tests';
    document.body.append(navigationLink);
    expect(fireEvent.click(navigationLink)).toBe(false);
    navigationLink.remove();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Your mock test changes have not been saved');
    expect(push).not.toHaveBeenCalled();
    expect(versionEditor).toHaveBeenLastCalledWith(expect.objectContaining({ manageNavigationGuard: false }));
  });
});
