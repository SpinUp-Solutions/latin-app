import { testRouteErrorResponse } from '@/src/app/api/admin/tests/errorResponse';
import { AdminAccessError } from '@/src/lib/verifyAdminAccess';

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init: { status: number }) => ({ body, status: init.status }),
  },
}));

jest.mock('@/src/services/firebase-admin', () => ({
  adminAuth: {},
  adminDb: {},
}));

describe('admin test API error responses', () => {
  it.each([
    ['Unauthorized', 401],
    ['Forbidden', 403],
  ] as const)('preserves the %s status', (message, status) => {
    const response = testRouteErrorResponse(new AdminAccessError(message, status), 'fetch') as unknown as {
      body: unknown;
      status: number;
    };

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ error: message });
  });
});
