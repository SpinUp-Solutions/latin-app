import { act, render, screen } from '@testing-library/react';
import CreateTestPage from '@/src/app/admin/tests/create/page';
import CreateMockPage from '@/src/app/admin/mock-tests/create/page';
import CreateVersionPage from '@/src/app/admin/tests/edit/[id]/versions/create/page';

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/components/ui/admin', () => ({
  TestVersionEditor: (props: { creationScope?: string; defaultVersionName?: string }) =>
    <div data-testid="version-editor" data-scope={props.creationScope} data-name={props.defaultVersionName} />,
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
  it('scopes normal-test creation and keeps its header navigation discoverable', () => {
    render(<CreateTestPage />);
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-scope', 'normal-test-create');
    expect(screen.getByRole('link', { name: 'Back to Tests' })).toHaveAttribute('href', '/admin/tests/manage');
  });

  it('scopes standalone-mock creation separately', () => {
    render(<CreateMockPage />);
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-scope', 'standalone-mock-create');
    expect(screen.getByRole('link', { name: 'Back to Mock Tests' })).toHaveAttribute('href', '/admin/mock-tests');
  });

  it('scopes an added version to its parent route and supplies a fresh-version name', async () => {
    await act(async () => {
      render(<CreateVersionPage params={Promise.resolve({ id: 'test-1' })} />);
      await Promise.resolve();
    });
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-scope', 'normal-test-test-1-version-create');
    expect(screen.getByTestId('version-editor')).toHaveAttribute('data-name', 'New Version');
    expect(screen.getByRole('link', { name: 'Back to test overview' })).toHaveAttribute('href', '/admin/tests/edit/test-1');
  });
});
