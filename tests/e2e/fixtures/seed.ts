import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export const E2E_PROJECT_ID = 'demo-latin-app';
export const E2E_PASSWORD = 'Playwright-pass-123!';

export const E2E_USERS = {
  admin: { uid: 'e2e-admin', email: 'admin@e2e.invalid', firstName: 'Ada', role: 'admin' },
  scoreOnly: { uid: 'e2e-score-only', email: 'score-only@e2e.invalid', firstName: 'Score', role: 'student' },
  requiredPass: { uid: 'e2e-required-pass', email: 'required-pass@e2e.invalid', firstName: 'Pass', role: 'student' },
  resume: { uid: 'e2e-resume', email: 'resume@e2e.invalid', firstName: 'Resume', role: 'student' },
  mock: { uid: 'e2e-mock', email: 'mock@e2e.invalid', firstName: 'Mock', role: 'student' },
} as const;

export const E2E_IDS = {
  scoreTest: 'e2e-score-test',
  passTest: 'e2e-pass-test',
  resumeTest: 'e2e-resume-test',
  mockParentTest: 'e2e-mock-parent-test',
  afterTest: 'e2e-after-test',
  scoreVersion: 'e2e-score-version',
  passVersion: 'e2e-pass-version',
  resumeVersion: 'e2e-resume-version',
  mockRotationVersion: 'e2e-mock-rotation-version',
  mockAssignableVersion: 'e2e-mock-assignable-version',
  afterVersion: 'e2e-after-version',
  nudgeVersion: 'e2e-nudge-version',
  nudgeMock: 'e2e-nudge-mock',
} as const;

const timestamp = '2026-07-28T10:00:00.000Z';
const audit = {
  createdAt: timestamp,
  createdBy: E2E_USERS.admin.uid,
  updatedAt: timestamp,
  updatedBy: E2E_USERS.admin.uid,
};

const feedbackConfig = { escalationLevels: [] };

function fillExercise(id: string, prompt: string, answer = 'love', maxPoints = 1) {
  return {
    id,
    type: 'fill',
    title: 'Translation',
    instructions: '',
    maxPoints,
    feedbackConfig,
    data: { items: [{ text: prompt, answer, hint: 'Acceptance fixture' }] },
  };
}

function generatedTranslationExercise() {
  return {
    id: 'e2e-generated-translation',
    type: 'generated-translation',
    title: 'Generated translation',
    instructions: '',
    maxPoints: 1,
    feedbackConfig,
    data: {
      generatorConfig: {
        collection: 'vocabulary_words_v5',
        wordSource: 'filters',
        count: 1,
      },
      posConfigs: {
        verb: {
          enabled: true,
          filters: {},
        },
      },
    },
  };
}

function version(
  id: string,
  name: string,
  exercise: Record<string, unknown> & { maxPoints: number } = fillExercise(`${id}-exercise`, 'amo')
) {
  return {
    id,
    name,
    pages: [{ id: `${id}-page`, title: name, items: [exercise] }],
    totalPages: 1,
    totalItems: 1,
    totalExercises: 1,
    totalPoints: exercise.maxPoints,
    ...audit,
  };
}

function testUnit(id: string, title: string, passingPercentage: number | null, versionIds: string[]) {
  return {
    id,
    kind: 'test',
    title,
    description: `Seeded acceptance fixture for ${title}`,
    passingPercentage,
    rotationVersions: versionIds.map(versionId => ({ versionId })),
    ...audit,
  };
}

function completedProgress(userId: string, testId: string) {
  return {
    userId,
    lessonId: testId,
    status: 'completed',
    completedAt: timestamp,
    lastAccessedAt: timestamp,
    progressSchemaVersion: 2,
    exerciseProgress: [],
  };
}

export function parentMockId(testId: string, versionId: string) {
  return `parent-${createHash('sha256')
    .update(JSON.stringify([testId, versionId]))
    .digest('hex')
    .slice(0, 48)}`;
}

export function getE2EAdmin() {
  process.env.GCLOUD_PROJECT = E2E_PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = E2E_PROJECT_ID;
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  const app =
    getApps().find(candidate => candidate.name === 'e2e') ?? initializeApp({ projectId: E2E_PROJECT_ID }, 'e2e');
  return { auth: getAuth(app), db: getFirestore(app) };
}

async function fetchEmulator(url: string, init: RequestInit) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw lastError;
}

async function resetEmulators() {
  const firestoreReset = await fetchEmulator(
    `http://127.0.0.1:8080/emulator/v1/projects/${E2E_PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!firestoreReset.ok) {
    throw new Error(`Could not reset the Firestore emulator: ${firestoreReset.status}`);
  }
  const authReset = await fetchEmulator(
    `http://127.0.0.1:9099/emulator/v1/projects/${E2E_PROJECT_ID}/accounts`,
    { method: 'DELETE' }
  );
  if (!authReset.ok) {
    throw new Error(`Could not reset the Auth emulator: ${authReset.status}`);
  }
}

export async function seedAcceptanceData() {
  await resetEmulators();
  const { auth, db } = getE2EAdmin();

  for (const user of Object.values(E2E_USERS)) {
    await auth.createUser({
      uid: user.uid,
      email: user.email,
      password: E2E_PASSWORD,
      emailVerified: true,
      displayName: `${user.firstName} Acceptance`,
    });
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      role: user.role,
      username: user.firstName.toLowerCase(),
      firstName: user.firstName,
      lastName: 'Acceptance',
      dateOfBirth: '',
      createdAt: timestamp,
    });
  }

  const versions = [
    version(E2E_IDS.scoreVersion, 'Score-only A'),
    version(E2E_IDS.passVersion, 'Required-pass A'),
    version(E2E_IDS.resumeVersion, 'Frozen generated A', generatedTranslationExercise()),
    version(
      E2E_IDS.mockRotationVersion,
      'Normal rotation A',
      fillExercise('e2e-normal-rotation-exercise', 'normal-rotation-prompt', 'normal-rotation-answer')
    ),
    version(
      E2E_IDS.mockAssignableVersion,
      'Mock assignment B',
      fillExercise('e2e-fixed-mock-exercise', 'fixed-version-prompt', 'fixed-answer')
    ),
    version(E2E_IDS.afterVersion, 'After-gate A'),
    version(E2E_IDS.nudgeVersion, 'Nudge fixed version'),
  ];
  await Promise.all(versions.map(item => db.collection('testVersions').doc(item.id).set(item)));

  const tests = [
    testUnit(E2E_IDS.scoreTest, 'Score-only checkpoint', null, [E2E_IDS.scoreVersion]),
    testUnit(E2E_IDS.passTest, 'Required-pass checkpoint', 100, [E2E_IDS.passVersion]),
    testUnit(E2E_IDS.resumeTest, 'Refresh and resume checkpoint', null, [E2E_IDS.resumeVersion]),
    testUnit(E2E_IDS.mockParentTest, 'Mock ownership checkpoint', null, [
      E2E_IDS.mockRotationVersion,
      E2E_IDS.mockAssignableVersion,
    ]),
    testUnit(E2E_IDS.afterTest, 'After-gate checkpoint', null, [E2E_IDS.afterVersion]),
  ];
  await Promise.all(tests.map(item => db.collection('lessons').doc(item.id).set(item)));

  await db
    .collection('learningPaths')
    .doc('default')
    .set({
      id: 'default',
      revision: 1,
      unitIds: tests.map(item => item.id),
      updatedAt: timestamp,
      updatedBy: E2E_USERS.admin.uid,
    });

  await db.collection('vocabulary_words_v5').doc('e2e-amo').set({
    word: 'amo',
    root_word: 'amo',
    selected_form: 'amo',
    dictionary_entry: 'amo, amare',
    translation: 'love',
    part_of_speech: 'verb',
    random_index: 0.5,
    sort_key: 'amo',
  });

  await db
    .collection('mockTests')
    .doc(E2E_IDS.nudgeMock)
    .set({
      id: E2E_IDS.nudgeMock,
      versionId: E2E_IDS.nudgeVersion,
      parent: { kind: 'test', testId: E2E_IDS.passTest },
      title: 'Required-pass practice',
      description: 'Related live mock used by the failure nudge.',
      passingPercentage: 100,
      status: 'active',
      isLive: true,
      mockOrder: 0,
      ...audit,
    });
  await db.collection('mockTestOrdering').doc('default').set({
    id: 'default',
    revision: 1,
    updatedAt: timestamp,
    updatedBy: E2E_USERS.admin.uid,
  });

  const completedByUser: Record<string, string[]> = {
    [E2E_USERS.scoreOnly.uid]: [],
    [E2E_USERS.requiredPass.uid]: [E2E_IDS.scoreTest],
    [E2E_USERS.resume.uid]: [E2E_IDS.scoreTest, E2E_IDS.passTest],
    [E2E_USERS.mock.uid]: [E2E_IDS.scoreTest, E2E_IDS.passTest, E2E_IDS.resumeTest],
  };
  await Promise.all(
    Object.entries(completedByUser).flatMap(([userId, testIds]) =>
      testIds.map(testId =>
        db.collection('userProgress').doc(`${userId}_${testId}`).set(completedProgress(userId, testId))
      )
    )
  );
}
