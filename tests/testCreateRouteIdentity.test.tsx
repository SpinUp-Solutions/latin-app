import { act, render, screen } from '@testing-library/react';
import CreateTestPage from '@/src/app/admin/(shell)/tests/create/page';
import CreateMockPage from '@/src/app/admin/(shell)/mock-tests/create/page';
import CreateVersionPage from '@/src/app/admin/(shell)/tests/edit/[id]/versions/create/page';

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/components/ui/admin', () => ({
  TestVersionEditor: (props: {
    creationScope?: string;
    defaultVersionName?: string;
    draftMode?: boolean;
    hideTestSettings?: boolean;
  }) => (
    <div
      data-testid="version-editor"
      data-scope={props.creationScope}
      data-name={props.defaultVersionName}
      data-draft={String(Boolean(props.draftMode))}
      data-hide-settings={String(Boolean(props.hideTestSettings))}
    />
  ),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/src/store/api/testApi', () => ({
  useCreateTestMutation: () => [jest.fn(), { isLoading: false }],
  useCreateTestVersionMutation: () => [jest.fn(), { isLoading: false }],
  useGetTestByIdQuery: () => ({ data: { test: { id: 'test-1', title: 'Test' } } }),
}));
jest.mock('@/src/store/api/mockTestApi', () => ({
  useCreateStandaloneMockMutation: () => [jest.fn(), { isLoading: false }],
}));

describe('test create route editor identities', () => {
  it('scopes normal-test creation', () => {
    render(<CreateTestPage />);
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-scope', 'normal-test-create');
  });

  it('scopes standalone-mock creation separately', () => {
    render(<CreateMockPage />);
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-scope', 'standalone-mock-create');
  });

  it('scopes an added version to its parent route and supplies a fresh-version name', async () => {
    await act(async () => {
      render(<CreateVersionPage params={Promise.resolve({ id: 'test-1' })} />);
      await Promise.resolve();
    });
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-scope', 'normal-test-test-1-version-create');
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-name', 'New Version');
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-draft', 'true');
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-hide-settings', 'true');
  });
});
