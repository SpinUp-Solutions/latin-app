import { createRouteErrorResponse } from '@/src/lib/route-error-response';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import { captureException } from '@sentry/nextjs';
import { ZodError } from 'zod';

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

class DomainBoom extends Error {
  readonly code = 'DOMAIN_BOOM';
  readonly status = 409;
  constructor(message = 'domain boom') {
    super(message);
  }
}

const routeErrorResponse = createRouteErrorResponse(DomainBoom);

describe('createRouteErrorResponse Sentry reporting', () => {
  beforeEach(() => {
    (captureException as jest.Mock).mockClear();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not report expected admin access errors', () => {
    const response = routeErrorResponse(new AdminAccessError('Forbidden', 403), 'fetch') as unknown as {
      status: number;
    };
    expect(response.status).toBe(403);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not report Zod validation errors', () => {
    const response = routeErrorResponse(new ZodError([]), 'create') as unknown as { status: number };
    expect(response.status).toBe(400);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not report registered domain errors', () => {
    const response = routeErrorResponse(new DomainBoom(), 'update') as unknown as { status: number };
    expect(response.status).toBe(409);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('reports unexpected errors on the 500 branch', () => {
    const error = new Error('firestore unavailable');
    const response = routeErrorResponse(error, 'fetch lesson') as unknown as {
      status: number;
      body: unknown;
    };

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to fetch lesson' });
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: { surface: 'route_error_response', action: 'fetch lesson' },
      })
    );
  });
});
