import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { TEST_ATTEMPTS_COLLECTION } from '@/shared/constants/firestore';
import { compareDiagramAnnotationSets } from '@/src/features/sentence-diagramming/model';
import type { DiagramAnnotation } from '@/src/features/sentence-diagramming/model';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { firestoreDocumentIdSchema } from '@/src/lib/learning-units/schemas';
import { parseExerciseAnswer } from '@/src/lib/tests/answer-schemas';
import { testAttemptDocumentSchema } from '@/src/lib/tests/schemas';
import { adminAuth, adminDb } from '@/src/services/firebase-admin';
import type { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';
import type { Lesson } from '@/src/types/lesson';

export const dynamic = 'force-dynamic';

const COLLECTION = 'diagramming_attempts';
const MAX_ANNOTATIONS = 250;

const asIndex = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

const asExerciseId = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 1500 ? value : null;

const asDocumentId = (value: unknown) => {
  const parsed = firestoreDocumentIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const asAnnotations = (value: unknown): DiagramAnnotation[] | null => {
  if (!Array.isArray(value) || value.length > MAX_ANNOTATIONS) return null;

  try {
    const answer = parseExerciseAnswer({ type: 'sentence-diagramming', annotations: value });
    return answer.type === 'sentence-diagramming' ? answer.annotations : null;
  } catch {
    return null;
  }
};

const isSentenceDiagrammingExercise = (value: unknown): value is SentenceDiagrammingExercise => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SentenceDiagrammingExercise>;
  const data = item.data as Partial<SentenceDiagrammingExercise['data']> | undefined;

  return (
    typeof item.id === 'string' &&
    item.type === 'sentence-diagramming' &&
    Boolean(data) &&
    Array.isArray(data?.tokens) &&
    Array.isArray(data?.solutionAnnotations)
  );
};

type ResolvedAuditSource = {
  exercise: SentenceDiagrammingExercise;
  pageIndex: number;
  itemIndex: number;
  auditFields:
    | { sourceKind: 'lesson'; lessonId: string }
    | {
        sourceKind: 'test-attempt';
        testAttemptId: string;
        testOrigin: { kind: 'normal-test'; testId: string } | { kind: 'mock-test'; mockTestId: string };
        testVersionId: string;
      };
};

async function resolveLessonAuditSource(
  lessonId: string,
  exerciseId: string,
  pageIndex: number,
  itemIndex: number
): Promise<ResolvedAuditSource | null> {
  const lessonSnapshot = await adminDb.collection('lessons').doc(lessonId).get();
  if (!lessonSnapshot.exists || !isLessonDocumentData(lessonSnapshot.data())) return null;

  const lesson = lessonSnapshot.data() as Lesson | undefined;
  const item = lesson?.pages?.[pageIndex]?.items?.[itemIndex];
  if (!isSentenceDiagrammingExercise(item) || item.id !== exerciseId) return null;

  return {
    exercise: item,
    pageIndex,
    itemIndex,
    auditFields: { sourceKind: 'lesson', lessonId },
  };
}

async function resolveTestAuditSource(
  attemptId: string,
  exerciseId: string,
  studentId: string
): Promise<ResolvedAuditSource | null> {
  const snapshot = await adminDb.collection(TEST_ATTEMPTS_COLLECTION).doc(attemptId).get();
  if (!snapshot.exists) return null;

  const parsed = testAttemptDocumentSchema.safeParse({ ...snapshot.data(), id: snapshot.id });
  if (!parsed.success) {
    console.error(`Test attempt ${attemptId} contains invalid persisted data for diagramming audit`);
    return null;
  }

  const attempt = parsed.data;
  if (attempt.status !== 'in-progress' || attempt.studentId !== studentId) return null;

  const matches: Array<{ item: unknown; pageIndex: number; itemIndex: number }> = [];
  attempt.deliveryState.pages.forEach((page, pageIndex) => {
    page.items.forEach((item, itemIndex) => {
      if (item.id !== exerciseId) return;
      matches.push({ item, pageIndex, itemIndex });
    });
  });

  const [match] = matches;
  if (matches.length !== 1 || !match || !isSentenceDiagrammingExercise(match.item)) return null;

  return {
    exercise: match.item,
    pageIndex: match.pageIndex,
    itemIndex: match.itemIndex,
    auditFields: {
      sourceKind: 'test-attempt',
      testAttemptId: attemptId,
      testOrigin: attempt.origin,
      testVersionId: attempt.versionId,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let user: { uid: string };
    try {
      user = await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requestBody: unknown = await request.json();
    if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
      return NextResponse.json({ error: 'Invalid attempt context' }, { status: 400 });
    }
    const body = requestBody as Record<string, unknown>;
    const exerciseId = asExerciseId(body.exerciseId);
    const studentAnnotations = asAnnotations(body.studentAnnotations);
    const lessonId = asDocumentId(body.lessonId);
    const attemptId = asDocumentId(body.attemptId);
    const pageIndex = asIndex(body.pageIndex);
    const itemIndex = asIndex(body.itemIndex);
    const hasLessonContext = lessonId !== null || body.pageIndex !== undefined || body.itemIndex !== undefined;
    const hasTestContext = attemptId !== null || body.attemptId !== undefined;

    if (!exerciseId || !studentAnnotations || hasLessonContext === hasTestContext) {
      return NextResponse.json({ error: 'Invalid attempt context' }, { status: 400 });
    }

    let source: ResolvedAuditSource | null = null;
    if (hasTestContext) {
      if (!attemptId) return NextResponse.json({ error: 'Invalid attempt context' }, { status: 400 });
      source = await resolveTestAuditSource(attemptId, exerciseId, user.uid);
    } else {
      if (!lessonId || pageIndex === null || itemIndex === null) {
        return NextResponse.json({ error: 'Invalid attempt context' }, { status: 400 });
      }
      source = await resolveLessonAuditSource(lessonId, exerciseId, pageIndex, itemIndex);
    }

    if (!source) {
      return NextResponse.json({ error: 'Diagramming exercise not found' }, { status: 404 });
    }

    // Expected annotations come only from trusted server-side lesson content or
    // the attempt's frozen delivery state; the browser submits raw annotations.
    const { exercise } = source;
    const comparison = compareDiagramAnnotationSets(
      studentAnnotations,
      exercise.data.solutionAnnotations,
      exercise.data.tokens
    );
    const createdAt = Timestamp.now();
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 100) : 'unknown';

    const attempt = {
      exerciseId,
      pageIndex: source.pageIndex,
      itemIndex: source.itemIndex,
      ...source.auditFields,
      userId: user.uid,
      rawSolutionCount: exercise.data.solutionAnnotations.length,
      canonicalSolutionCount: comparison.canonicalSolutionAnnotations.length,
      rawStudentCount: studentAnnotations.length,
      canonicalStudentCount: comparison.canonicalStudentAnnotations.length,
      matched: comparison.matched,
      expected: comparison.expected,
      extra: comparison.extra,
      missingIds: comparison.missingIds,
      extraIds: comparison.extraIds,
      differences: comparison.differences,
      isComplete: comparison.isComplete,
      accuracy: comparison.accuracy,
      rawStudentAnnotations: studentAnnotations,
      canonicalStudentAnnotations: comparison.canonicalStudentAnnotations,
      rawSolutionAnnotations: exercise.data.solutionAnnotations,
      canonicalSolutionAnnotations: comparison.canonicalSolutionAnnotations,
      tokens: exercise.data.tokens,
      appVersion,
      createdAt,
      date: createdAt.toDate().toISOString().slice(0, 10),
    };

    const document = await adminDb.collection(COLLECTION).add(attempt);
    console.log(
      JSON.stringify({
        event: 'diagramming_attempt',
        attemptId: document.id,
        sourceKind: attempt.sourceKind,
        lessonId: 'lessonId' in attempt ? attempt.lessonId : undefined,
        testAttemptId: 'testAttemptId' in attempt ? attempt.testAttemptId : undefined,
        exerciseId,
        userId: user.uid,
        rawSolutionCount: attempt.rawSolutionCount,
        canonicalSolutionCount: attempt.canonicalSolutionCount,
        rawStudentCount: attempt.rawStudentCount,
        canonicalStudentCount: attempt.canonicalStudentCount,
        matched: attempt.matched,
        expected: attempt.expected,
        extra: attempt.extra,
        date: attempt.date,
      })
    );

    return NextResponse.json({ id: document.id }, { status: 201 });
  } catch (error) {
    console.error('diagramming_attempt_write_failed', error);
    return NextResponse.json({ error: 'Unable to record diagramming attempt' }, { status: 500 });
  }
}
