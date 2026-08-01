export interface BreadcrumbRoute {
  template: string;
  crumbs: string[];
  /**
   * Destinations for every crumb except the current page. These are kept on
   * the route definition rather than inferred from labels, because several
   * admin sections use a dedicated management page as their true parent.
   */
  parentHrefs?: (pathname: string) => Array<string | undefined>;
}

export interface AdminBreadcrumb {
  label: string;
  href?: string;
}

const normalizePathname = (pathname: string) => pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');

export const routeMatchesTemplate = (pathname: string, template: string) => {
  const pathSegments = normalizePathname(pathname).split('/').filter(Boolean);
  const templateSegments = template.split('/').filter(Boolean);

  return (
    pathSegments.length === templateSegments.length &&
    templateSegments.every((segment, index) => segment.startsWith('$') || segment === pathSegments[index])
  );
};

export const BREADCRUMB_ROUTES: BreadcrumbRoute[] = [
  {
    template: 'lessons/edit/$id/versions/$versionId/edit',
    crumbs: ['Lessons', 'Lesson details', 'Version editor'],
    parentHrefs: pathname => ['/admin/lessons/manage', `/admin/lessons/edit/${getPathSegment(pathname, 2)}`],
  },
  {
    template: 'lessons/edit/$id/versions/create',
    crumbs: ['Lessons', 'Lesson details', 'New version'],
    parentHrefs: pathname => ['/admin/lessons/manage', `/admin/lessons/edit/${getPathSegment(pathname, 2)}`],
  },
  { template: 'lessons/manage', crumbs: ['Lessons'] },
  { template: 'lessons/create', crumbs: ['Lessons', 'New lesson'], parentHrefs: () => ['/admin/lessons/manage'] },
  { template: 'lessons/edit/$id', crumbs: ['Lessons', 'Lesson details'], parentHrefs: () => ['/admin/lessons/manage'] },
  { template: 'lessons/live', crumbs: ['Lessons', 'Live Lessons'], parentHrefs: () => ['/admin/lessons/manage'] },
  {
    template: 'tests/edit/$id/versions/$versionId/edit',
    crumbs: ['Tests', 'Test details', 'Version editor'],
    parentHrefs: pathname => ['/admin/tests/manage', `/admin/tests/edit/${getPathSegment(pathname, 2)}`],
  },
  {
    template: 'tests/edit/$id/versions/create',
    crumbs: ['Tests', 'Test details', 'New version'],
    parentHrefs: pathname => ['/admin/tests/manage', `/admin/tests/edit/${getPathSegment(pathname, 2)}`],
  },
  { template: 'tests/manage', crumbs: ['Tests'] },
  { template: 'tests/create', crumbs: ['Tests', 'New test'], parentHrefs: () => ['/admin/tests/manage'] },
  { template: 'tests/edit/$id', crumbs: ['Tests', 'Test details'], parentHrefs: () => ['/admin/tests/manage'] },
  { template: 'mock-tests/create', crumbs: ['Mock Tests', 'New mock test'], parentHrefs: () => ['/admin/mock-tests'] },
  {
    template: 'mock-tests/$mockId',
    crumbs: ['Mock Tests', 'Mock test details'],
    parentHrefs: () => ['/admin/mock-tests'],
  },
  { template: 'mock-tests', crumbs: ['Mock Tests'] },
  {
    template: 'vocabulary/advanced',
    crumbs: ['Vocabulary', 'Advanced Filters'],
    parentHrefs: () => ['/admin/vocabulary'],
  },
  {
    template: 'vocabulary/pending',
    crumbs: ['Vocabulary', 'Pending Review'],
    parentHrefs: () => ['/admin/vocabulary'],
  },
  { template: 'vocabulary', crumbs: ['Vocabulary'] },
  {
    template: 'vocabulary-pools/create',
    crumbs: ['Vocabulary Pools', 'Create Pool'],
    parentHrefs: () => ['/admin/vocabulary-pools'],
  },
  {
    template: 'vocabulary-pools/$poolId/edit',
    crumbs: ['Vocabulary Pools', 'Edit Pool'],
    parentHrefs: () => ['/admin/vocabulary-pools'],
  },
  { template: 'vocabulary-pools', crumbs: ['Vocabulary Pools'] },
  {
    template: 'practice-categories/$categoryId',
    crumbs: ['Practice Categories', 'Category Details'],
    parentHrefs: () => ['/admin/practice-categories'],
  },
  { template: 'practice-categories', crumbs: ['Practice Categories'] },
  { template: 'diagramming-attempts', crumbs: ['Diagramming Attempts'] },
];

const getPathSegment = (pathname: string, index: number) =>
  normalizePathname(pathname).split('/').filter(Boolean)[index];

const SEGMENT_LABELS: Record<string, string> = {
  lessons: 'Lessons',
  manage: 'Manage',
  create: 'Create',
  edit: 'Edit',
  live: 'Live Lessons',
  tests: 'Tests',
  'mock-tests': 'Mock Tests',
  vocabulary: 'Vocabulary',
  'vocabulary-pools': 'Vocabulary Pools',
  'practice-categories': 'Practice Categories',
  'diagramming-attempts': 'Diagramming Attempts',
  versions: 'Versions',
  advanced: 'Advanced Filters',
  pending: 'Pending Review',
};

export const getAdminBreadcrumbItems = (pathname: string): AdminBreadcrumb[] => {
  if (normalizePathname(pathname) === '') return [{ label: 'Admin' }];

  const matchedRoute = BREADCRUMB_ROUTES.find(route => routeMatchesTemplate(pathname, route.template));
  if (matchedRoute) {
    const parentHrefs = matchedRoute.parentHrefs?.(pathname) ?? [];
    return [
      { label: 'Admin', href: '/admin' },
      ...matchedRoute.crumbs.map((label, index) => {
        const href = index === matchedRoute.crumbs.length - 1 ? undefined : parentHrefs[index];
        return href ? { label, href } : { label };
      }),
    ];
  }

  return [
    { label: 'Admin', href: '/admin' },
    ...normalizePathname(pathname)
      .split('/')
      .filter(Boolean)
      .map(segment => ({ label: SEGMENT_LABELS[segment] ?? 'Details' })),
  ];
};

/** Kept for callers that only need labels, such as page-title tests. */
export const getAdminBreadcrumbs = (pathname: string) => getAdminBreadcrumbItems(pathname).map(item => item.label);
