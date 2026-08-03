import { POST } from '@/src/app/api/admin/lessons/repair-legacy-fields/route';
import { LegacyLearningUnitRepairOperationError } from '@/src/lib/learning-units/legacy-field-repair-operation';

const verifyGcloudProjectAccess = jest.fn();
const verifyGcloudStorageAccess = jest.fn();
const runLegacyLearningUnitRepairOperation = jest.fn();
const terminate = jest.fn();

jest.mock('next/server', () => jest.requireActual('./helpers/routeMocks'));
jest.mock('firebase-admin/firestore', () => ({
  Firestore: jest.fn(() => ({ name: 'db', terminate: (...args: unknown[]) => terminate(...args) })),
}));
jest.mock('@google-cloud/storage', () => ({ Storage: jest.fn(() => ({ name: 'storage' })) }));
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn(() => ({ setCredentials: jest.fn() })),
  GoogleAuth: jest.fn(() => ({ name: 'auth' })),
}));
jest.mock('@/src/lib/verifyGcloudProjectAccess', () => ({
  ...jest.requireActual('@/src/lib/verifyGcloudProjectAccess'),
  verifyGcloudProjectAccess: (...args: unknown[]) => verifyGcloudProjectAccess(...args),
  verifyGcloudStorageAccess: (...args: unknown[]) => verifyGcloudStorageAccess(...args),
}));
jest.mock('@/src/lib/learning-units/legacy-field-repair-operation', () => ({
  LegacyLearningUnitRepairOperationError: class LegacyLearningUnitRepairOperationError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
      this.name = 'LegacyLearningUnitRepairOperationError';
    }
  },
  runLegacyLearningUnitRepairOperation: (...args: unknown[]) => runLegacyLearningUnitRepairOperation(...args),
}));

function request(body: unknown) {
  return {
    headers: new Headers({ Authorization: 'Bearer gcloud-token' }),
    json: async () => body,
  } as never;
}

describe('legacy learning-unit field repair route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'latin-app-prod';
    verifyGcloudProjectAccess.mockResolvedValue({
      email: 'operator@example.com',
      authentication: 'gcloud-oauth-access-token',
      permissions: ['datastore.entities.get', 'datastore.entities.list', 'datastore.entities.update'],
      accessToken: 'gcloud-token',
      expiresIn: 3000,
    });
    verifyGcloudStorageAccess.mockResolvedValue(undefined);
    runLegacyLearningUnitRepairOperation.mockResolvedValue({ mode: 'dry-run', planHash: 'a'.repeat(64) });
  });

  it('runs an authenticated, read-only dry run', async () => {
    const response = (await POST(request({ mode: 'dry-run' }))) as unknown as {
      status: number;
      body: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ mode: 'dry-run', planHash: 'a'.repeat(64) });
    expect(verifyGcloudProjectAccess).toHaveBeenCalledWith(expect.anything(), 'latin-app-prod');
    expect(verifyGcloudStorageAccess).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'operator@example.com' }),
      'latin-app-prod.firebasestorage.app'
    );
    expect(runLegacyLearningUnitRepairOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'latin-app-prod',
        request: { mode: 'dry-run' },
        operator: expect.objectContaining({ email: 'operator@example.com' }),
      })
    );
  });

  it('requires both the reviewed plan hash and exact apply confirmation', async () => {
    const response = (await POST(
      request({ mode: 'apply', planHash: 'a'.repeat(64), confirmation: 'yes' })
    )) as unknown as { status: number; body: { error: string } };

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid migration request');
    expect(runLegacyLearningUnitRepairOperation).not.toHaveBeenCalled();
  });

  it('returns a conflict when post-migration verification still finds legacy fields', async () => {
    runLegacyLearningUnitRepairOperation.mockRejectedValue(
      new LegacyLearningUnitRepairOperationError('Verification failed', 409)
    );

    const response = (await POST(request({ mode: 'verify' }))) as unknown as {
      status: number;
      body: { error: string };
    };

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'Verification failed' });
  });

  it('terminates the request-scoped production Firestore client after the operation', async () => {
    await POST(request({ mode: 'dry-run' }));
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
