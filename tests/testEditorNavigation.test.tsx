import { fireEvent, render, screen } from '@testing-library/react';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { clearStableTestEditorIdentity, getStableTestEditorIdentity } from '@/src/lib/tests/editor-session';

function GuardHarness({ dirty = true, onNavigate = () => undefined }: { dirty?: boolean; onNavigate?: () => void }) {
  const guard = useUnsavedNavigationGuard(dirty, 'Unsaved test changes');
  return (
    <>
      <a
        href="/admin/tests/manage"
        onClick={event => {
          event.preventDefault();
          onNavigate();
        }}>
        Header back link
      </a>
      <button onClick={() => void guard.replaceAfterSave(onNavigate)}>Replace after save</button>
      <UnsavedNavigationDialog guard={guard} />
    </>
  );
}

describe('test editor navigation and route identities', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', '/admin/tests/edit/test-1');
    jest.restoreAllMocks();
  });

  it.each(['normal-test-create', 'standalone-mock-create', 'normal-test-test-1-version-create'])(
    'keeps the %s create identity stable across reloads until completion',
    scope => {
      const testId = getStableTestEditorIdentity(scope, 'test', 'test');
      const versionId = getStableTestEditorIdentity(scope, 'version', 'version');
      expect(getStableTestEditorIdentity(scope, 'test', 'test')).toBe(testId);
      expect(getStableTestEditorIdentity(scope, 'version', 'version')).toBe(versionId);
      clearStableTestEditorIdentity(scope);
      expect(sessionStorage.getItem(`test_editor_identity:${scope}:test`)).toBeNull();
      expect(sessionStorage.getItem(`test_editor_identity:${scope}:version`)).toBeNull();
    }
  );

  it('guards header links with an in-app dialog and lets Stay remain on the editor', () => {
    const onNavigate = jest.fn();
    render(<GuardHarness onNavigate={onNavigate} />);
    expect(fireEvent.click(screen.getByRole('link', { name: 'Header back link' }))).toBe(false);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Unsaved test changes');
    fireEvent.click(screen.getByRole('button', { name: 'Stay on page' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('replays a link after Leave is chosen in the app dialog', () => {
    const onNavigate = jest.fn();
    render(<GuardHarness onNavigate={onNavigate} />);
    expect(fireEvent.click(screen.getByRole('link', { name: 'Header back link' }))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('uses one history sentinel and permits Back after the app dialog is confirmed', () => {
    const go = jest.spyOn(window.history, 'go').mockImplementation(() => undefined);
    render(<GuardHarness />);
    window.history.replaceState({}, '', window.location.href);
    fireEvent(window, new PopStateEvent('popstate'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
    expect(go).toHaveBeenCalledWith(-2);
    fireEvent(window, new PopStateEvent('popstate'));
    expect(go).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('restores the sentinel after Stay is chosen for Back navigation', () => {
    const pushState = jest.spyOn(window.history, 'pushState');
    render(<GuardHarness />);
    const pushesAfterMount = pushState.mock.calls.length;
    window.history.replaceState({}, '', window.location.href);
    fireEvent(window, new PopStateEvent('popstate'));
    expect(pushState).toHaveBeenCalledTimes(pushesAfterMount + 1);
    fireEvent.click(screen.getByRole('button', { name: 'Stay on page' }));
    expect(pushState).toHaveBeenCalledTimes(pushesAfterMount + 1);
  });

  it('protects refresh only while dirty', () => {
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const view = render(<GuardHarness />);
    const guarded = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(guarded);
    expect(guarded.defaultPrevented).toBe(true);
    view.rerender(<GuardHarness dirty={false} />);
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('removes the guard sentinel before replacing a successfully saved create route', () => {
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const onNavigate = jest.fn();
    render(<GuardHarness onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Replace after save' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(onNavigate).not.toHaveBeenCalled();

    window.history.replaceState({}, '', window.location.href);
    fireEvent(window, new PopStateEvent('popstate'));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
