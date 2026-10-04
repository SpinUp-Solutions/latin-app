import { routeErrorResponse } from '@/src/lib/route-error-response';
import { DomainError } from '@/src/lib/domain-error';
import { AdminAccessError } from '@/src/lib/admin-access-error';
import { captureException } from '@sentry/nextjs';
import { ZodError } from 'zod';

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));

class DomainBoom extends DomainError {
  readonly code = 'DOMAIN_BOOM';
  readonly status = 409;
  constructor(
    message = 'domain boom',
    readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

describe('routeErrorResponse', () => {
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

  it('keeps the code of admin access errors such as the content sync lock', () => {
    const response = routeErrorResponse(new AdminAccessError('Maintenance', 409, 'SYNC_IN_PROGRESS'), 'save') as unknown as {
      status: number;
      body: unknown;
    };
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Maintenance', code: 'SYNC_IN_PROGRESS' });
  });

  it('does not report Zod validation errors', () => {
    const response = routeErrorResponse(new ZodError([]), 'create') as unknown as { status: number };
    expect(response.status).toBe(400);
    expect(captureException).not.toHaveBeenCalled();
  });

  it('answers a domain error with its status, message and code, without reporting it', () => {
    const response = routeErrorResponse(new DomainBoom(), 'update') as unknown as { status: number; body: unknown };
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'domain boom', code: 'DOMAIN_BOOM' });
    expect(captureException).not.toHaveBeenCalled();
  });

  it('includes the details of a domain error in the response body', () => {
    const response = routeErrorResponse(new DomainBoom('incomplete', { missing: ['a'] }), 'finish') as unknown as {
      body: unknown;
    };
    expect(response.body).toEqual({ error: 'incomplete', code: 'DOMAIN_BOOM', missing: ['a'] });
  });

  it('never passes through the message of an error that is not a domain error, even one with a status', () => {
    const sdkError = Object.assign(new Error('POST https://iamcredentials.googleapis.com/ sa@project.iam'), {
      status: 403,
      code: 'ERR_BAD_REQUEST',
    });
    const response = routeErrorResponse(sdkError, 'sign link') as unknown as { status: number; body: unknown };

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to sign link' });
    expect(captureException).toHaveBeenCalledWith(sdkError, expect.anything());
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
