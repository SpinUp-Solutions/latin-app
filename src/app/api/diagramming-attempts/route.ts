import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/src/services/firebase-admin';
import { compareDiagramAnnotationSets, DiagramAnnotation } from '@/src/features/sentence-diagramming';
import type { Lesson } from '@/src/types/lesson';
import type { SentenceDiagrammingExercise } from '@/src/types/exercises/sentence-diagramming';

export const dynamic = 'force-dynamic';

const COLLECTION = 'diagramming_attempts';
const MAX_ANNOTATIONS = 250;

const asIndex = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;

const asAnnotations = (value: unknown): DiagramAnnotation[] => {
  if (!Array.isArray(value) || value.length > MAX_ANNOTATIONS) return [];
  return value as DiagramAnnotation[];
};

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await adminAuth.verifyIdToken(token);
    const body = await request.json();
    const lessonId = typeof body.lessonId === 'string' ? body.lessonId : null;
    const exerciseId = typeof body.exerciseId === 'string' ? body.exerciseId : null;
    const pageIndex = asIndex(body.pageIndex);
    const itemIndex = asIndex(body.itemIndex);

    if (!lessonId || !exerciseId || pageIndex === null || itemIndex === null) {
      return NextResponse.json({ error: 'Invalid attempt context' }, { status: 400 });
    }

    // The expected answer comes from Firestore, not the client, so each audit record
    // remains trustworthy even if a browser request is altered.
    const lessonSnapshot = await adminDb.collection('lessons').doc(lessonId).get();
    const lesson = lessonSnapshot.data() as Lesson | undefined;
    const item = lesson?.pages?.[pageIndex]?.items?.[itemIndex];

    if (!item || item.id !== exerciseId || item.type !== 'sentence-diagramming') {
      return NextResponse.json({ error: 'Diagramming exercise not found' }, { status: 404 });
    }

    const exercise = item as SentenceDiagrammingExercise;
    const studentAnnotations = asAnnotations(body.studentAnnotations);
    const comparison = compareDiagramAnnotationSets(
      studentAnnotations,
      exercise.data.solutionAnnotations,
      exercise.data.tokens
    );
    const createdAt = Timestamp.now();
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 100) : 'unknown';

    const attempt = {
      exerciseId,
      lessonId,
      pageIndex,
      itemIndex,
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
        lessonId,
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
