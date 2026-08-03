import { LEGACY_REPAIR_REQUIRED_PERMISSIONS, verifyGcloudProjectAccess } from '@/src/lib/verifyGcloudProjectAccess';

function request(token?: string) {
  return {
    headers: new Headers(token ? { Authorization: `Bearer ${token}` } : {}),
  } as never;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('gcloud project access verification', () => {
  it('accepts a live token only when the identity has every required production permission', async () => {
    const fetchImplementation = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ email: 'ADMIN@example.com', expires_in: '3000' }))
      .mockResolvedValueOnce(jsonResponse({ permissions: [...LEGACY_REPAIR_REQUIRED_PERMISSIONS] }));

    await expect(
      verifyGcloudProjectAccess(
        request('short-lived-token'),
        'latin-app-prod',
        LEGACY_REPAIR_REQUIRED_PERMISSIONS,
        fetchImplementation
      )
    ).resolves.toEqual({
      email: 'admin@example.com',
      authentication: 'gcloud-oauth-access-token',
      permissions: [...LEGACY_REPAIR_REQUIRED_PERMISSIONS].sort(),
    });

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      'https://cloudresourcemanager.googleapis.com/v1/projects/latin-app-prod:testIamPermissions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer short-lived-token' }),
      })
    );
  });

  it('rejects requests without a bearer token before making any network request', async () => {
    const fetchImplementation = jest.fn();

    await expect(
      verifyGcloudProjectAccess(request(), 'latin-app-prod', LEGACY_REPAIR_REQUIRED_PERMISSIONS, fetchImplementation)
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects a valid identity that lacks production update permission', async () => {
    const fetchImplementation = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ email: 'reader@example.com', expires_in: '3000' }))
      .mockResolvedValueOnce(jsonResponse({ permissions: ['datastore.entities.get', 'datastore.entities.list'] }));

    await expect(
      verifyGcloudProjectAccess(
        request('read-only-token'),
        'latin-app-prod',
        LEGACY_REPAIR_REQUIRED_PERMISSIONS,
        fetchImplementation
      )
    ).rejects.toEqual(
      expect.objectContaining({
        status: 403,
        message: expect.stringContaining('datastore.entities.update'),
      })
    );
  });
});
