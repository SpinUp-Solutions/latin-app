import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';

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

describe('unsaved navigation guard on an editor', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/admin/tests/edit/test-1');
    jest.restoreAllMocks();
  });

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

let forceRender: () => void = () => undefined;

// Mirrors the practice-category and live-lesson pages: a dirty flag, a message derived per render,
// and a context switch that discards the draft and rewrites the query string.
function OrderingPage({ initiallyDirty = true, tagOrder = false }: { initiallyDirty?: boolean; tagOrder?: boolean }) {
  const [dirty, setDirty] = useState(initiallyDirty);
  const [, setRenderCount] = useState(0);
  useEffect(() => {
    forceRender = () => setRenderCount(count => count + 1);
  }, []);
  const guard = useUnsavedNavigationGuard(
    dirty,
    `Your reordered ${tagOrder ? 'tags' : 'lessons'} have not been saved.`
  );
  const switchToArchived = () =>
    guard.requestNavigation(() => {
      setDirty(false);
      void guard.replaceAfterSave(() =>
        window.history.replaceState(window.history.state, '', '/admin/practice-categories?status=archived')
      );
    });

  return (
    <>
      <a href="/admin/tests/manage">Tests</a>
      <button onClick={switchToArchived}>Archived</button>
      <UnsavedNavigationDialog guard={guard} />
    </>
  );
}

describe('unsaved navigation guard on an ordering page', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/admin/practice-categories?status=active');
  });

  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
    jest.restoreAllMocks();
  });

  it('pushes one Back guard entry even when each push re-renders the page and the message changes', async () => {
    // Next.js answers a native pushState with a router update that re-renders the page.
    // The cap turns a regression into a failed assertion instead of a hung run.
    let pushes = 0;
    jest.spyOn(window.history, 'pushState').mockImplementation(() => {
      pushes += 1;
      if (pushes < 25) queueMicrotask(() => forceRender());
    });

    const { rerender } = render(<OrderingPage />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
    rerender(<OrderingPage tagOrder />);
    act(() => forceRender());

    expect(pushes).toBe(1);
  });

  it('writes a discarded context switch to the page entry, not the guard entry', async () => {
    const pageState = { page: true };
    window.history.replaceState(pageState, '', '/admin/practice-categories?status=active');
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => {
      window.history.replaceState(pageState, '', '/admin/practice-categories?status=active');
      window.dispatchEvent(new PopStateEvent('popstate', { state: pageState }));
    });
    render(<OrderingPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
    });

    expect(back).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?status=archived');
    expect(window.history.state).toEqual(pageState);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('switches context straight away when nothing is dirty', () => {
    const back = jest.spyOn(window.history, 'back');
    render(<OrderingPage initiallyDirty={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));

    expect(back).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?status=archived');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
