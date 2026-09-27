import React, { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { useBeforeUnload } from '@/src/hooks/useLessonDraft';

let forceRender: () => void = () => undefined;

function EditorPage({ dirty, onNavigateAway }: { dirty: boolean; onNavigateAway?: (destination?: string) => void }) {
  const [, setRenderCount] = useState(0);
  useEffect(() => {
    forceRender = () => setRenderCount(count => count + 1);
  }, []);
  // Like the lesson edit page, pass a new callback on every render.
  useBeforeUnload(dirty, destination => onNavigateAway?.(destination));
  return <a href="/admin/lessons/manage">Manage lessons</a>;
}

describe('useBeforeUnload', () => {
  let pushState: jest.SpyInstance;

  beforeEach(() => {
    pushState = jest.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    cleanup();
    pushState.mockRestore();
  });

  it('pushes one guard entry while changes stay unsaved, not one per render', () => {
    render(<EditorPage dirty />);
    act(() => forceRender());
    act(() => forceRender());

    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it('does not loop when a history push re-renders the page (Next.js App Router behavior)', async () => {
    // Next.js 16.3 answers a native pushState with a router update that re-renders the page.
    // Model that, with a cap so a regression fails the assertion instead of hanging the run.
    let pushes = 0;
    pushState.mockImplementation(() => {
      pushes += 1;
      if (pushes < 25) queueMicrotask(() => forceRender());
    });

    render(<EditorPage dirty />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(pushes).toBe(1);
  });

  it('uses the latest navigation callback for browser back and in-app links', () => {
    const first = jest.fn();
    const latest = jest.fn();
    const { rerender, getByText } = render(<EditorPage dirty onNavigateAway={first} />);
    rerender(<EditorPage dirty onNavigateAway={latest} />);

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    fireEvent.click(getByText('Manage lessons'));

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenNthCalledWith(1, undefined);
    expect(latest).toHaveBeenNthCalledWith(2, '/admin/lessons/manage');
  });

  it('does not guard history when there are no unsaved changes', () => {
    render(<EditorPage dirty={false} />);
    act(() => forceRender());

    expect(pushState).not.toHaveBeenCalled();
  });
});
