import { expect, test, type APIRequestContext } from '@playwright/test';
import { E2E_PASSWORD, E2E_USERS, getE2EAdmin, seedAcceptanceData } from './fixtures/seed';

const MIGRATION_ENDPOINT = '/api/admin/learning-path/migration';
const LEGACY_LESSON_IDS = ['e2e-legacy-first', 'e2e-legacy-second'];

type MigrationManifest = {
  migrationId: string;
  createdAt: string;
  sourceHash: string;
  unitIds: string[];
  source: Array<{ unitId: string; liveOrder: number }>;
};

function legacyLesson(id: string, title: string, liveOrder: number) {
  const timestamp = '2026-07-30T10:00:00.000Z';
  return {
    id,
    kind: 'lesson',
    title,
    description: `${title} migration fixture`,
    type: 'normal',
    pages: [{ id: `${id}-page`, title, items: [] }],
    isLive: true,
    liveOrder,
    publishedAt: timestamp,
    publishedBy: E2E_USERS.admin.uid,
    createdAt: timestamp,
    createdBy: E2E_USERS.admin.uid,
    updatedAt: timestamp,
    updatedBy: E2E_USERS.admin.uid,
    version: 1,
    totalPages: 1,
    totalItems: 0,
    totalExercises: 0,
  };
}

async function getAdminIdToken(): Promise<string> {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: E2E_USERS.admin.email,
        password: E2E_PASSWORD,
        returnSecureToken: true,
      }),
    }
  );
  const body = (await response.json()) as { idToken?: string; error?: unknown };
  if (!response.ok || !body.idToken) {
    throw new Error(`Could not obtain an emulator admin token: ${JSON.stringify(body.error ?? body)}`);
  }
  return body.idToken;
}

async function command(request: APIRequestContext, token: string, data: unknown) {
  return request.post(MIGRATION_ENDPOINT, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}

test.describe('Learning Path migration acceptance', () => {
  test.beforeEach(async () => {
    await seedAcceptanceData();
    const { db } = getE2EAdmin();
    await db.collection('learningPaths').doc('default').delete();
    const migrationRecords = await db.collection('learningPathMigrations').get();
    await Promise.all([
      ...migrationRecords.docs.map(document => document.ref.delete()),
      db
        .collection('lessons')
        .doc(LEGACY_LESSON_IDS[0])
        .set(legacyLesson(LEGACY_LESSON_IDS[0], 'First legacy lesson', 2)),
      db
        .collection('lessons')
        .doc(LEGACY_LESSON_IDS[1])
        .set(legacyLesson(LEGACY_LESSON_IDS[1], 'Second legacy lesson', 7)),
    ]);
  });

  test('completes the reviewed cutover, rollback rehearsal, reapply, and retirement lifecycle', async ({ request }) => {
    const { db } = getE2EAdmin();
    const token = await getAdminIdToken();
    const lessonsBefore = await Promise.all(
      LEGACY_LESSON_IDS.map(async id => (await db.collection('lessons').doc(id).get()).data())
    );

    const dryRunResponse = await command(request, token, {
      action: 'dry-run',
      migrationId: 'e2e-learning-path-cutover',
    });
    expect(dryRunResponse.status()).toBe(200);
    const { manifest } = (await dryRunResponse.json()) as { manifest: MigrationManifest };
    expect(manifest).toMatchObject({
      migrationId: 'e2e-learning-path-cutover',
      unitIds: LEGACY_LESSON_IDS,
      source: [
        { unitId: LEGACY_LESSON_IDS[0], liveOrder: 2 },
        { unitId: LEGACY_LESSON_IDS[1], liveOrder: 7 },
      ],
    });
    expect(manifest.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await db.collection('learningPaths').doc('default').get()).exists).toBe(false);
    await expect(
      db
        .collection('learningPathMigrations')
        .doc(manifest.migrationId)
        .get()
        .then(snapshot => snapshot.data())
    ).resolves.toMatchObject({ status: 'prepared', manifest });

    const applyResponse = await command(request, token, { action: 'apply', migrationId: manifest.migrationId });
    expect(applyResponse.status()).toBe(200);
    const firstApply = (await applyResponse.json()) as {
      applied: boolean;
      path: { revision: number; unitIds: string[]; cutover: { state: string } };
    };
    expect(firstApply).toMatchObject({
      applied: true,
      path: {
        revision: 1,
        unitIds: LEGACY_LESSON_IDS,
        cutover: { state: 'active' },
      },
    });

    const retryResponse = await command(request, token, { action: 'apply', migrationId: manifest.migrationId });
    expect(retryResponse.status()).toBe(200);
    await expect(retryResponse.json()).resolves.toMatchObject({
      applied: false,
      path: { revision: 1, unitIds: LEGACY_LESSON_IDS },
    });

    const verifyResponse = await command(request, token, { action: 'verify', migrationId: manifest.migrationId });
    expect(verifyResponse.status()).toBe(200);
    await expect(verifyResponse.json()).resolves.toMatchObject({
      verified: true,
      path: { revision: 1, unitIds: LEGACY_LESSON_IDS, cutover: { state: 'active' } },
    });

    const activeView = await request.get('/api/admin/learning-path', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(activeView.status()).toBe(200);
    await expect(activeView.json()).resolves.toMatchObject({
      source: 'learning-path',
      canEdit: false,
      effectiveUnitIds: LEGACY_LESSON_IDS,
      path: { cutover: { state: 'active' } },
    });

    const rollbackResponse = await command(request, token, {
      action: 'rollback',
      migrationId: manifest.migrationId,
    });
    expect(rollbackResponse.status()).toBe(200);
    await expect(rollbackResponse.json()).resolves.toMatchObject({
      path: { revision: 1, unitIds: LEGACY_LESSON_IDS, cutover: { state: 'inactive' } },
    });

    const rolledBackView = await request.get('/api/admin/learning-path', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rolledBackView.status()).toBe(200);
    await expect(rolledBackView.json()).resolves.toMatchObject({
      source: 'legacy',
      canEdit: false,
      effectiveUnitIds: LEGACY_LESSON_IDS,
      path: { cutover: { state: 'inactive' } },
    });

    const reapplyResponse = await command(request, token, {
      action: 'apply',
      migrationId: manifest.migrationId,
    });
    expect(reapplyResponse.status()).toBe(200);
    await expect(reapplyResponse.json()).resolves.toMatchObject({
      applied: true,
      path: { revision: 2, unitIds: LEGACY_LESSON_IDS, cutover: { state: 'active' } },
    });

    const secondVerifyResponse = await command(request, token, {
      action: 'verify',
      migrationId: manifest.migrationId,
    });
    expect(secondVerifyResponse.status()).toBe(200);
    await expect(secondVerifyResponse.json()).resolves.toMatchObject({
      verified: true,
      path: { revision: 2, unitIds: LEGACY_LESSON_IDS },
    });

    const retireResponse = await command(request, token, {
      action: 'retire',
      migrationId: manifest.migrationId,
    });
    expect(retireResponse.status()).toBe(200);
    const retired = (await retireResponse.json()) as { path: Record<string, unknown> };
    expect(retired.path).toMatchObject({ revision: 2, unitIds: LEGACY_LESSON_IDS });
    expect(retired.path).not.toHaveProperty('cutover');

    const retiredView = await request.get('/api/admin/learning-path', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(retiredView.status()).toBe(200);
    const retiredViewBody = (await retiredView.json()) as {
      source: string;
      canEdit: boolean;
      effectiveUnitIds: string[];
      path: Record<string, unknown>;
    };
    expect(retiredViewBody).toMatchObject({
      source: 'learning-path',
      canEdit: true,
      effectiveUnitIds: LEGACY_LESSON_IDS,
    });
    expect(retiredViewBody.path).not.toHaveProperty('cutover');

    const unavailableRollback = await command(request, token, {
      action: 'rollback',
      migrationId: manifest.migrationId,
    });
    expect(unavailableRollback.status()).toBe(409);
    await expect(unavailableRollback.json()).resolves.toMatchObject({ code: 'ROLLBACK_UNAVAILABLE' });

    const lessonsAfter = await Promise.all(
      LEGACY_LESSON_IDS.map(async id => (await db.collection('lessons').doc(id).get()).data())
    );
    expect(lessonsAfter).toEqual(lessonsBefore);
  });
});
