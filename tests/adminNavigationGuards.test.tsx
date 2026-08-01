import { fireEvent, renderHook } from '@testing-library/react';
import { useBrowserNavigationProtection } from '@/src/components/admin/practice-categories/category-admin-shared';
import { useBeforeUnload } from '@/src/hooks/useLessonDraft';

const appendNavigationLink = (href: string) => {
  const link = document.createElement('a');
  link.href = href;
  document.body.append(link);
  return link;
};

describe('admin navigation guards', () => {
  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
  });

  it('blocks same-origin links while practice-category ordering is dirty', () => {
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderHook(() => useBrowserNavigationProtection(true, 'category order changes'));
    const link = appendNavigationLink('/admin/tests/manage');

    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Discard your unsaved category order changes?');
  });

  it('allows a confirmed practice-category navigation', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    renderHook(() => useBrowserNavigationProtection(true, 'category order changes'));
    const link = appendNavigationLink('/admin/tests/manage');

    expect(fireEvent.click(link)).toBe(true);
  });

  it('passes the selected link destination to the lesson draft callback', () => {
    const onNavigateAway = jest.fn();
    renderHook(() => useBeforeUnload(true, onNavigateAway));
    const link = appendNavigationLink('/admin/mock-tests?status=active#results');

    expect(fireEvent.click(link)).toBe(false);
    expect(onNavigateAway).toHaveBeenCalledWith('/admin/mock-tests?status=active#results');
  });
});
