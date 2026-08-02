import { routeMatchesTemplate } from './breadcrumb-utils';

export interface AdminNavigationItem {
  href: string;
  label: string;
  disabled?: boolean;
}

const EDITOR_NAVIGATION_TARGETS = [
  { template: 'lessons/create', href: '/admin/lessons/manage' },
  { template: 'lessons/edit/$id', href: '/admin/lessons/manage' },
  { template: 'tests/create', href: '/admin/tests/manage' },
  { template: 'tests/edit/$id', href: '/admin/tests/manage' },
  { template: 'tests/edit/$id/versions/create', href: '/admin/tests/manage' },
  { template: 'tests/edit/$id/versions/$versionId/edit', href: '/admin/tests/manage' },
];

const matchesNavigationHref = (pathname: string, href: string) =>
  href === '/admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

export const getActiveAdminNavigationHref = (pathname: string, items: AdminNavigationItem[]) => {
  const directMatch = items
    .filter(item => matchesNavigationHref(pathname, item.href))
    .sort((first, second) => second.href.length - first.href.length)[0];

  if (directMatch) return directMatch.href;

  return EDITOR_NAVIGATION_TARGETS.find(target => routeMatchesTemplate(pathname, target.template))?.href ?? null;
};
