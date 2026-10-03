import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useBeforeUnload } from '@/src/hooks/useLessonDraft';
import { useUnsavedNavigationGuard } from '@/src/hooks/useUnsavedNavigationGuard';
import { UnsavedNavigationDialog } from '@/src/components/ui/core/UnsavedNavigationDialog';

const appendNavigationLink = (href: string) => {
  const link = document.createElement('a');
  link.href = href;
  document.body.append(link);
  return link;
};

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

describe('admin navigation guards', () => {
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

  it('asks in the app dialog before following a same-origin link while ordering is dirty', () => {
    render(<OrderingPage tagOrder />);

    expect(fireEvent.click(screen.getByRole('link', { name: 'Tests' }))).toBe(false);
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Your reordered tags have not been saved.');
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

  it('passes the selected link destination to the lesson draft callback', () => {
    const onNavigateAway = jest.fn();
    renderHook(() => useBeforeUnload(true, onNavigateAway));
    const link = appendNavigationLink('/admin/mock-tests?status=active#results');

    expect(fireEvent.click(link)).toBe(false);
    expect(onNavigateAway).toHaveBeenCalledWith('/admin/mock-tests?status=active#results');
  });
});
