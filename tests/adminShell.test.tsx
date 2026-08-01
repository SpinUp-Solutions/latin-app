import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AdminPageHeader,
  AdminShell,
  getActiveAdminNavigationHref,
  getAdminBreadcrumbItems,
  getAdminBreadcrumbs,
} from '@/src/components/admin/shell';
import { AdminSidebar } from '@/src/components/admin/shell/AdminSidebar';

let pathname = '/admin/vocabulary/pending';

jest.mock('next/navigation', () => ({ usePathname: () => pathname }));
jest.mock('next/image', () => ({ __esModule: true, default: ({ alt }: { alt: string }) => <span aria-label={alt} /> }));

describe('admin shell routing and accessibility', () => {
  beforeEach(() => sessionStorage.clear());

  it('uses explicit breadcrumb templates and falls back safely for unknown dynamic routes', () => {
    expect(getAdminBreadcrumbs('/admin/tests/edit/test-1/versions/version-1/edit')).toEqual([
      'Admin',
      'Tests',
      'Test details',
      'Version editor',
    ]);
    expect(getAdminBreadcrumbs('/admin/practice-categories/category-1')).toEqual([
      'Admin',
      'Practice Categories',
      'Category Details',
    ]);
    expect(getAdminBreadcrumbs('/admin/unknown/record-1')).toEqual(['Admin', 'Details', 'Details']);

    expect(getAdminBreadcrumbItems('/admin/tests/edit/test-1/versions/version-1/edit')).toEqual([
      { label: 'Admin', href: '/admin' },
      { label: 'Tests', href: '/admin/tests/manage' },
      { label: 'Test details', href: '/admin/tests/edit/test-1' },
      { label: 'Version editor' },
    ]);
  });

  it('uses exact Overview matching, longest direct matches, and editor parent targets', () => {
    const items = [
      { href: '/admin', label: 'Overview' },
      { href: '/admin/vocabulary', label: 'All Words' },
      { href: '/admin/vocabulary/pending', label: 'Pending Review' },
      { href: '/admin/vocabulary-pools', label: 'Vocabulary Pools' },
      { href: '/admin/lessons/manage', label: 'Lessons' },
      { href: '/admin/tests/manage', label: 'Tests' },
    ];

    expect(getActiveAdminNavigationHref('/admin', items)).toBe('/admin');
    expect(getActiveAdminNavigationHref('/admin/vocabulary/pending', items)).toBe('/admin/vocabulary/pending');
    expect(getActiveAdminNavigationHref('/admin/vocabulary-pools', items)).toBe('/admin/vocabulary-pools');
    expect(getActiveAdminNavigationHref('/admin/lessons/edit/lesson-1', items)).toBe('/admin/lessons/manage');
    expect(getActiveAdminNavigationHref('/admin/tests/edit/test-1/versions/version-1/edit', items)).toBe(
      '/admin/tests/manage'
    );
  });

  it('marks exactly one active navigation link and exposes the mobile navigation trigger', () => {
    pathname = '/admin/vocabulary/pending';
    render(
      <AdminShell>
        <div>Page content</div>
      </AdminShell>
    );

    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pending Review' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Open admin navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Vocabulary' })).toHaveAttribute('href', '/admin/vocabulary');
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');

    fireEvent.click(screen.getByRole('button', { name: 'Open admin navigation' }));
    expect(screen.getByRole('dialog', { name: 'Admin navigation' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeInTheDocument();
  });

  it('does not add a redundant back button on section landing pages', () => {
    pathname = '/admin/tests/manage';
    render(
      <AdminShell>
        <div>Page content</div>
      </AdminShell>
    );

    expect(screen.queryByRole('link', { name: 'Back to Admin' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin');
  });

  it('renders the matching sidebar item as keyboard reachable', () => {
    pathname = '/admin/vocabulary';
    render(<AdminSidebar />);
    const active = screen.getByRole('link', { name: 'All Words' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('focus-visible:ring-2');
    expect(screen.queryByRole('link', { name: 'Advanced Filters' })).not.toBeInTheDocument();
  });

  it('collapses the desktop sidebar while keeping its navigation accessible', () => {
    pathname = '/admin/lessons/manage';
    render(
      <AdminShell>
        <div>Page content</div>
      </AdminShell>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse admin sidebar' }));

    expect(screen.getByRole('button', { name: 'Expand admin sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lessons' })).toHaveAttribute('aria-current', 'page');
    expect(sessionStorage.getItem('admin-sidebar-collapse')).toBe('true');
  });

  it('forwards focus attributes to a page heading', () => {
    render(
      <AdminPageHeader
        title="Category"
        headingProps={{ id: 'category-detail-heading', tabIndex: -1, 'data-dialog-focus-fallback': true }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Category' })).toHaveAttribute('id', 'category-detail-heading');
    expect(screen.getByRole('heading', { name: 'Category' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('heading', { name: 'Category' })).toHaveAttribute('data-dialog-focus-fallback', 'true');
  });
});
