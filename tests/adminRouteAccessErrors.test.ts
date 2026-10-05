import { AdminAccessError } from '@/src/lib/admin-access-error';
import { GET as listRecovery, POST as saveToRecovery } from '@/src/app/api/admin/lessons/recovery/route';
import { DELETE as discardRecovery, POST as retryRecovery } from '@/src/app/api/admin/lessons/recovery/[id]/route';
import { GET as listDiagrammingAttempts } from '@/src/app/api/admin/diagramming-attempts/route';
import { POST as reorderLessons } from '@/src/app/api/admin/lessons/reorder/route';
import { POST as updatePublishStatus } from '@/src/app/api/admin/lessons/update-publish-status/route';
import { GET as listPoolUsages } from '@/src/app/api/admin/vocabulary-pools/usages/route';

const mockVerifyAdminAccess = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/services/firebase-admin', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('@/src/lib/verifyAdminAccess', () => ({
  ...jest.requireActual('@/src/lib/admin-access-error'),
  verifyAdminAccess: (...args: unknown[]) => mockVerifyAdminAccess(...args),
}));

type RouteResponse = { status: number; body: unknown };
const context = { params: Promise.resolve({ id: 'recovery-1' }) };
const request = { json: async () => ({}), nextUrl: { searchParams: new URLSearchParams() } } as never;

/** Routes that used to map admin-access failures by hand, each differently. */
const routes: Array<[string, () => Promise<unknown>]> = [
  ['list lesson recovery items', () => listRecovery(request)],
  ['save a lesson to recovery', () => saveToRecovery(request)],
  ['retry a lesson from recovery', () => retryRecovery(request, context)],
  ['discard a recovery item', () => discardRecovery(request, context)],
  ['list diagramming attempts', () => listDiagrammingAttempts(request)],
  ['reorder lessons', () => reorderLessons(request)],
  ['update lesson publish status', () => updatePublishStatus(request)],
  ['list vocabulary pool usages', () => listPoolUsages(request)],
];

describe.each(routes)('admin access failures on %s', (_name, call) => {
  it.each([
    ['a missing or invalid token', new AdminAccessError('Unauthorized', 401), { error: 'Unauthorized' }],
    ['a signed-in non-admin', new AdminAccessError('Forbidden', 403), { error: 'Forbidden' }],
    [
      'content maintenance in progress',
      new AdminAccessError('Maintenance is in progress.', 409, 'VOCABULARY_CONTENT_SYNC_IN_PROGRESS'),
      { error: 'Maintenance is in progress.', code: 'VOCABULARY_CONTENT_SYNC_IN_PROGRESS' },
    ],
  ])('answers %s with its own status', async (_case, error, body) => {
    mockVerifyAdminAccess.mockRejectedValue(error);

    const response = (await call()) as RouteResponse;

    expect(response).toEqual({ status: error.status, body });
  });
});
