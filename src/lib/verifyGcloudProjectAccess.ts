import type { NextRequest } from 'next/server';

const TOKEN_INFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const RESOURCE_MANAGER_BASE_URL = 'https://cloudresourcemanager.googleapis.com/v1/projects';

export const LEGACY_REPAIR_REQUIRED_PERMISSIONS = [
  'datastore.entities.get',
  'datastore.entities.list',
  'datastore.entities.update',
] as const;

export const LEGACY_REPAIR_REQUIRED_STORAGE_PERMISSIONS = ['storage.buckets.get', 'storage.objects.create'] as const;

export type GcloudProjectOperator = {
  email: string;
  authentication: 'gcloud-oauth-access-token';
  permissions: string[];
  accessToken: string;
  expiresIn: number;
};

export class GcloudProjectAccessError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 502
  ) {
    super(message);
    this.name = 'GcloudProjectAccessError';
  }
}

type FetchImplementation = typeof fetch;

function bearerToken(request: Pick<NextRequest, 'headers'>): string {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new GcloudProjectAccessError('A gcloud OAuth bearer token is required', 401);
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw new GcloudProjectAccessError('A gcloud OAuth bearer token is required', 401);
  return token;
}

async function readTokenIdentity(token: string, fetchImplementation: FetchImplementation) {
  const response = await fetchImplementation(TOKEN_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const status = response.status === 400 || response.status === 401 ? 401 : 502;
    throw new GcloudProjectAccessError(
      status === 401 ? 'The gcloud OAuth token is invalid or expired' : 'Unable to verify the gcloud OAuth token',
      status
    );
  }

  const payload = (await response.json()) as { email?: unknown; expires_in?: unknown };
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const expiresIn = Number(payload.expires_in);
  if (!email || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new GcloudProjectAccessError('The gcloud OAuth token has no valid operator identity', 401);
  }

  return { email, expiresIn };
}

async function readProjectPermissions(
  token: string,
  projectId: string,
  permissions: readonly string[],
  fetchImplementation: FetchImplementation
) {
  const response = await fetchImplementation(
    `${RESOURCE_MANAGER_BASE_URL}/${encodeURIComponent(projectId)}:testIamPermissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ permissions }),
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const status = response.status === 401 ? 401 : response.status === 403 ? 403 : 502;
    throw new GcloudProjectAccessError("Unable to verify the operator's production IAM permissions", status);
  }

  const payload = (await response.json()) as { permissions?: unknown };
  return Array.isArray(payload.permissions)
    ? payload.permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];
}

/**
 * Authorizes a one-off production operation with a short-lived token from
 * `gcloud auth print-access-token`. The token must belong to an identity that
 * already has the exact Firestore permissions needed by the operation.
 */
export async function verifyGcloudProjectAccess(
  request: Pick<NextRequest, 'headers'>,
  projectId: string,
  permissions: readonly string[] = LEGACY_REPAIR_REQUIRED_PERMISSIONS,
  fetchImplementation: FetchImplementation = fetch
): Promise<GcloudProjectOperator> {
  const token = bearerToken(request);
  const [identity, grantedPermissions] = await Promise.all([
    readTokenIdentity(token, fetchImplementation),
    readProjectPermissions(token, projectId, permissions, fetchImplementation),
  ]);
  const missingPermissions = permissions.filter(permission => !grantedPermissions.includes(permission));

  if (missingPermissions.length > 0) {
    throw new GcloudProjectAccessError(
      `The gcloud identity lacks required production permissions: ${missingPermissions.join(', ')}`,
      403
    );
  }

  return {
    email: identity.email,
    authentication: 'gcloud-oauth-access-token',
    permissions: [...grantedPermissions].sort(),
    accessToken: token,
    expiresIn: identity.expiresIn,
  };
}

export async function verifyGcloudStorageAccess(
  operator: GcloudProjectOperator,
  bucket: string,
  permissions: readonly string[] = LEGACY_REPAIR_REQUIRED_STORAGE_PERMISSIONS,
  fetchImplementation: FetchImplementation = fetch
) {
  const query = new URLSearchParams();
  for (const permission of permissions) query.append('permissions', permission);
  const response = await fetchImplementation(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/iam/testPermissions?${query}`,
    {
      headers: { Authorization: `Bearer ${operator.accessToken}` },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    const status = response.status === 401 ? 401 : response.status === 403 ? 403 : 502;
    throw new GcloudProjectAccessError('Unable to verify production snapshot permissions', status);
  }

  const payload = (await response.json()) as { permissions?: unknown };
  const grantedPermissions = Array.isArray(payload.permissions)
    ? payload.permissions.filter((permission): permission is string => typeof permission === 'string')
    : [];
  const missingPermissions = permissions.filter(permission => !grantedPermissions.includes(permission));
  if (missingPermissions.length > 0) {
    throw new GcloudProjectAccessError(
      `The gcloud identity lacks required snapshot permissions: ${missingPermissions.join(', ')}`,
      403
    );
  }
}
