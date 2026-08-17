import { act, render, screen } from '@testing-library/react';
import CreateTestPage from '@/src/app/admin/(shell)/tests/create/page';
import CreateMockPage from '@/src/app/admin/(shell)/mock-tests/create/page';
import CreateVersionPage from '@/src/app/admin/(shell)/tests/edit/[id]/versions/create/page';
import type { TestVersionEditorSaveResult, TestVersionEditorValue } from '@/src/components/ui/admin/TestVersionEditor';

const mockRouterReplace = jest.fn();
const mockCreateTest = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
let mockVersionEditorProps:
  | {
      creationScope?: string;
      defaultVersionName?: string;
      draftMode?: boolean;
      hideTestSettings?: boolean;
      onSave: (value: TestVersionEditorValue) => Promise<TestVersionEditorSaveResult | void>;
    }
  | undefined;

jest.mock('@/src/components/auth/withAdminAuth', () => ({ withAdminAuth: (Component: unknown) => Component }));
jest.mock('@/src/components/ui/admin', () => ({
  TestVersionEditor: (props: {
    creationScope?: string;
    defaultVersionName?: string;
    draftMode?: boolean;
    hideTestSettings?: boolean;
    onSave: (value: TestVersionEditorValue) => Promise<TestVersionEditorSaveResult | void>;
  }) => (
    (mockVersionEditorProps = props),
    (
      <div
        data-testid="version-editor"
        data-scope={props.creationScope}
        data-name={props.defaultVersionName}
        data-draft={String(Boolean(props.draftMode))}
        data-hide-settings={String(Boolean(props.hideTestSettings))}
      />
    )
  ),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockRouterReplace }),
}));
jest.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));
jest.mock('@/src/store/api/testApi', () => ({
  useCreateTestMutation: () => [mockCreateTest, { isLoading: false }],
  useCreateTestVersionMutation: () => [jest.fn(), { isLoading: false }],
  useGetTestByIdQuery: () => ({ data: { test: { id: 'test-1', title: 'Test' } } }),
}));
jest.mock('@/src/store/api/mockTestApi', () => ({
  useCreateStandaloneMockMutation: () => [jest.fn(), { isLoading: false }],
}));

describe('test create route editor identities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVersionEditorProps = undefined;
    mockCreateTest.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ test: { id: 'test-1' }, version: { id: 'version-1' }, recovered: false }),
    });
  });

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

  it('replaces the create route after a successful save', async () => {
    const value = {
      test: { id: 'test-1', title: 'Test', description: '', passingPercentage: null },
      version: { id: 'version-1', name: 'Version A', pages: [] },
    } as TestVersionEditorValue;
    render(<CreateTestPage />);

    const result = await mockVersionEditorProps?.onSave(value);
    expect(mockCreateTest).toHaveBeenCalledWith(value);
    expect(mockRouterReplace).not.toHaveBeenCalled();

    result?.afterSave?.({ draftPreserved: false });
    expect(mockRouterReplace).toHaveBeenCalledWith('/admin/tests/edit/test-1');
  });

  it('treats an exact repeated create as a successful backward-compatible save', async () => {
    const value = {
      test: { id: 'test-1', title: 'Test', description: '', passingPercentage: null },
      version: { id: 'version-1', name: 'Version A', pages: [] },
    } as TestVersionEditorValue;
    mockCreateTest.mockReturnValue({
      unwrap: jest.fn().mockResolvedValue({ test: { id: 'test-1' }, version: { id: 'version-1' }, recovered: true }),
    });
    render(<CreateTestPage />);

    const result = await mockVersionEditorProps?.onSave(value);
    result?.afterSave?.({ draftPreserved: false });
    expect(mockRouterReplace).toHaveBeenCalledWith('/admin/tests/edit/test-1');
    expect(mockToastSuccess).toHaveBeenCalledWith('Test saved');
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('does not recover an unrelated test ID collision', async () => {
    const value = {
      test: { id: 'test-1', title: 'Test', description: '', passingPercentage: null },
      version: { id: 'version-1', name: 'Version A', pages: [] },
    } as TestVersionEditorValue;
    const collision = {
      status: 409,
      data: { code: 'TEST_ALREADY_EXISTS', error: 'A test with this ID already exists' },
    };
    mockCreateTest.mockReturnValue({ unwrap: jest.fn().mockRejectedValue(collision) });
    render(<CreateTestPage />);

    await expect(mockVersionEditorProps?.onSave(value)).rejects.toBe(collision);
    expect(mockRouterReplace).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith('A test with this ID already exists');
  });
});
