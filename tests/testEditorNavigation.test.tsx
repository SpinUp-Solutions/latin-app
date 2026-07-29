import { fireEvent, render, screen } from '@testing-library/react';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { clearStableTestEditorIdentity, getStableTestEditorIdentity } from '@/src/lib/tests/editor-session';

function GuardHarness({ dirty = true }: { dirty?: boolean }) {
  useUnsavedNavigationGuard(dirty, 'Unsaved test changes');
  return <a href="/admin/tests/manage">Header back link</a>;
}

describe('test editor navigation and route identities', () => {
  beforeEach(() => {
    sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it.each([
    'normal-test-create',
    'standalone-mock-create',
    'normal-test-test-1-version-create',
  ])('keeps the %s create identity stable across reloads until completion', scope => {
    const testId = getStableTestEditorIdentity(scope, 'test', 'test');
    const versionId = getStableTestEditorIdentity(scope, 'version', 'version');
    expect(getStableTestEditorIdentity(scope, 'test', 'test')).toBe(testId);
    expect(getStableTestEditorIdentity(scope, 'version', 'version')).toBe(versionId);
    clearStableTestEditorIdentity(scope);
    expect(sessionStorage.getItem(`test_editor_identity:${scope}:test`)).toBeNull();
    expect(sessionStorage.getItem(`test_editor_identity:${scope}:version`)).toBeNull();
  });

  it('guards header links and lets a cancelled click remain on the editor', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<GuardHarness />);
    expect(fireEvent.click(screen.getByRole('link', { name: 'Header back link' }))).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Unsaved test changes');
  });

  it('allows a confirmed link with one prompt', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<GuardHarness />);
    expect(fireEvent.click(screen.getByRole('link', { name: 'Header back link' }))).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('uses one history sentinel and permits the second pop without double prompting', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => undefined);
    render(<GuardHarness />);
    fireEvent(window, new PopStateEvent('popstate'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    fireEvent(window, new PopStateEvent('popstate'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('restores the sentinel after a cancelled Back with one prompt', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => undefined);
    const pushState = jest.spyOn(window.history, 'pushState');
    render(<GuardHarness />);
    const pushesAfterMount = pushState.mock.calls.length;
    fireEvent(window, new PopStateEvent('popstate'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
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
});
