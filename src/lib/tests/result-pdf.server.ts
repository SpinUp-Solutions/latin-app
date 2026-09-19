import { LEARNING_UNITS_COLLECTION, MOCK_TESTS_COLLECTION } from '@/shared/constants/firestore';
import { buildTestResultPdfFilename } from '@/src/lib/tests/result-pdf-filename';
import { sourceTitleFromDocument, studentIdentityFromProfile } from '@/src/lib/tests/result-pdf-identity';
import { buildTestResultPdfModel } from '@/src/lib/tests/result-pdf-model';
import { renderTestResultPdf } from '@/src/lib/tests/result-pdf';
import { adminDb } from '@/src/services/firebase-admin';
import type { StudentTestResult } from '@/src/types/test-results';
import type { Firestore } from 'firebase-admin/firestore';

export async function createSubmittedResultPdf(
  result: StudentTestResult,
  actor: { uid: string; email?: string | null },
  db: Firestore = adminDb
): Promise<{ bytes: Uint8Array; filename: string }> {
  const origin = result.attempt.origin;
  const sourceRef =
    origin.kind === 'mock-test'
      ? db.collection(MOCK_TESTS_COLLECTION).doc(origin.mockTestId)
      : db.collection(LEARNING_UNITS_COLLECTION).doc(origin.testId);
  const [sourceSnapshot, userSnapshot] = await Promise.all([
    sourceRef.get().catch(() => null),
    db
      .collection('users')
      .doc(actor.uid)
      .get()
      .catch(() => null),
  ]);

  const source = sourceTitleFromDocument(origin, sourceSnapshot?.data());
  const identity = studentIdentityFromProfile(userSnapshot?.data(), actor.email);
  const model = buildTestResultPdfModel({ result, identity, source });
  const bytes = await renderTestResultPdf(model);
  return {
    bytes,
    filename: buildTestResultPdfFilename({
      studentName: identity.name,
      testTitle: source.title,
      submittedAt: result.attempt.submittedAt,
    }),
  };
}
