import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import lessonEditorReducer from '@/src/store/slices/lessonEditorSlice';
import { TestVersionEditor } from '@/src/components/ui/admin/TestVersionEditor';
import VersionEditorPage from '@/src/app/admin/tests/edit/[id]/versions/[versionId]/edit/page';

const routerPush = jest.fn();
const editorProps = jest.fn();

jest.mock('@/src/components/auth/withAdminAuth', () => ({
  withAdminAuth: (Component: unknown) => Component,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/src/components/ui/admin', () => ({
  TestVersionEditor: (props: unknown) => {
    editorProps(props);
    return <div data-testid="route-version-editor" />;
  },
}));
jest.mock('@/src/components/ui/admin/lesson-builder/PageSection', () => ({
  PageSection: () => null,
}));
jest.mock('@/src/components/ui/admin/ContentEditor', () => ({
  ContentEditor: () => null,
}));
jest.mock('@/src/components/ui/core/clipboard', () => ({
  ClipboardProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/components/ui/admin/test-version/TestVersionPreview', () => ({
  TestVersionPreview: () => null,
}));
jest.mock('@/src/components/ui/admin/vocabulary-pools/VocabularyPoolSelector', () => ({
  VocabularyPoolSelector: ({
    selectedPoolId,
    onPoolSelect,
  }: {
    selectedPoolId?: string;
    onPoolSelect: (poolId: string | undefined) => void;
  }) => (
    <div data-testid="vocabulary-pool-selector">
      <span>{selectedPoolId ?? 'no-pool'}</span>
      <button onClick={() => onPoolSelect('pool-2')}>Choose pool 2</button>
    </div>
  ),
}));
jest.mock('@/src/components/ui/admin/MockAssignmentDialog', () => ({
  MockAssignmentDialog: (props: {
    open: boolean;
    defaultTitle: string;
    defaultDescription?: string;
    defaultPassingPercentage: number | null;
  }) =>
    props.open ? (
      <div role="dialog">
        {props.defaultTitle}|{props.defaultDescription}|{String(props.defaultPassingPercentage)}
      </div>
    ) : null,
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const test = {
  id: 'test-1',
  kind: 'test' as const,
  title: 'Chapter test',
  description: 'Chapter description',
  passingPercentage: 75,
  rotationVersions: [{ versionId: 'version-1' }],
};
const version = {
  id: 'version-1',
  name: 'Version A',
  pages: [{ id: 'page-1', title: 'Page A', items: [] }],
  totalPages: 1,
  totalItems: 0,
  totalExercises: 0,
  totalPoints: 0,
};

jest.mock('@/src/store/api/testApi', () => ({
  useGetTestByIdQuery: () => ({ data: { test, versions: [], mocks: [] }, isLoading: false }),
  useGetTestVersionByIdQuery: () => ({ data: version, isLoading: false, isError: false }),
  useUpdateTestMutation: () => [jest.fn(), { isLoading: false }],
  useDuplicateTestVersionMutation: () => [jest.fn(), { isLoading: false }],
}));

describe('normal version editor mock-assignment contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: jest.fn(() => 'request-id'),
    });
  });

  it('blocks assignment while dirty and opens the configured confirmation only after discard', async () => {
    const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
    render(
      <Provider store={store}>
        <TestVersionEditor
          initialTest={test}
          initialVersion={version}
          onSave={jest.fn()}
          mockAssignment={{
            testId: test.id,
            defaultTitle: 'Chapter test — Version A',
            defaultDescription: test.description,
            defaultPassingPercentage: test.passingPercentage,
            onAssigned: jest.fn(),
          }}
        />
      </Provider>
    );

    await screen.findByRole('heading', { name: 'Test Version Editor' });
    expect(screen.getByRole('button', { name: 'Assign as mock' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Version name'), { target: { value: 'Dirty name' } });
    expect(screen.getByRole('button', { name: 'Assign as mock' })).toBeDisabled();
    expect(
      screen.getByText('Save or discard your version changes before transferring it out of rotation.')
    ).toBeInTheDocument();

    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign as mock' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Assign as mock' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Chapter test — Version A|Chapter description|75');
  });

  it('preserves edits made while a save request is pending', async () => {
    let resolveSave: (() => void) | undefined;
    const onSave = jest.fn(
      () =>
        new Promise<void>(resolve => {
          resolveSave = resolve;
        })
    );
    const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
    render(
      <Provider store={store}>
        <TestVersionEditor initialTest={test} initialVersion={version} onSave={onSave} />
      </Provider>
    );

    await screen.findByRole('heading', { name: 'Test Version Editor' });
    fireEvent.change(screen.getByLabelText('Version name'), { target: { value: 'Submitted name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Test' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Version name'), { target: { value: 'Newer unsaved name' } });
    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });

    expect(screen.getByLabelText('Version name')).toHaveValue('Newer unsaved name');
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled();
  });

  it('saves the selected vocabulary pool with the version', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const store = configureStore({ reducer: { lessonEditor: lessonEditorReducer } });
    render(
      <Provider store={store}>
        <TestVersionEditor initialTest={test} initialVersion={version} onSave={onSave} />
      </Provider>
    );

    await screen.findByRole('heading', { name: 'Test Version Editor' });
    fireEvent.click(screen.getByRole('button', { name: 'Choose pool 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Test' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          version: expect.objectContaining({ vocabularyPoolId: 'pool-2' }),
        })
      )
    );
  });

  it('wires the existing-version route to the editor and navigates after assignment', async () => {
    await act(async () => {
      render(<VersionEditorPage params={Promise.resolve({ id: test.id, versionId: version.id })} />);
      await Promise.resolve();
    });
    expect(screen.getByTestId('route-version-editor')).toBeInTheDocument();
    const props = editorProps.mock.calls.at(-1)?.[0] as {
      mockAssignment: {
        testId: string;
        defaultTitle: string;
        defaultDescription: string;
        defaultPassingPercentage: number | null;
        onAssigned: (mockId: string) => void;
      };
    };
    expect(props.mockAssignment).toMatchObject({
      testId: 'test-1',
      defaultTitle: 'Chapter test — Version A',
      defaultDescription: 'Chapter description',
      defaultPassingPercentage: 75,
    });
    props.mockAssignment.onAssigned('mock-1');
    expect(routerPush).toHaveBeenCalledWith('/admin/mock-tests/mock-1');
  });
});
