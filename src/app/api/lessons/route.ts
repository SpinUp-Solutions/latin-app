import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { auth } from 'firebase-admin';
import { isLessonDocumentData } from '@/src/lib/learning-units/domain';
import { LessonWithProgress, UserProgress } from '@/src/types/lesson';
import { calculateStoredProgress, getFurthestPageIndex, isStoredLessonComplete } from '@/src/utils/lessonProgress';
import { isPracticeLessonType } from '@/src/utils/practiceCategoryLessons';
import { practiceCategoryService } from '@/src/lib/practice-categories/service';

export const dynamic = 'force-dynamic';

async function verifyAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    return await auth().verifyIdToken(token);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await verifyAuth(request);

    const snapshot = await adminDb.collection('lessons').where('isLive', '==', true).orderBy('liveOrder', 'asc').get();

    if (snapshot.empty) {
      return NextResponse.json({ lessons: [] });
    }

    // This route is a legacy lesson-only projection. Filter by the explicit
    // discriminator before applying the legacy missing-type default.
    let allLessons = snapshot.docs.filter(doc => isLessonDocumentData(doc.data())).map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        kind: 'lesson' as const,
        title: data.title,
        description: data.description,
        type: data.type || 'normal',
        vocabulary_pool: data.vocabulary_pool,
        pages: data.pages || [],
        isLive: data.isLive,
        liveOrder: data.liveOrder,
        publishedAt: data.publishedAt,
        publishedBy: data.publishedBy,
        createdAt: data.createdAt,
        createdBy: data.createdBy,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
        version: data.version,
      };
    });

    const practiceLessonIds = allLessons.filter(lesson => isPracticeLessonType(lesson.type)).map(lesson => lesson.id);
    if (practiceLessonIds.length > 0) {
      try {
        const assignments = await practiceCategoryService.getAssignmentsForLessonIds(practiceLessonIds);
        allLessons = allLessons.map(lesson => {
          const assignment = assignments.get(lesson.id);
          if (!assignment) return lesson;

          const activeCategories = assignment.practiceCategories
            .filter(category => category.status === 'active')
            .map(({ id, lessonType, name, description, status, categoryOrder }) => ({
              id,
              lessonType,
              name,
              description,
              status,
              categoryOrder,
            }));
          const activeCategoryIds = new Set(activeCategories.map(category => category.id));

          return {
            ...lesson,
            practiceCategories: activeCategories,
            practiceCategoryPlacements: assignment.memberships
              .filter(membership => activeCategoryIds.has(membership.categoryId))
              .map(membership => ({
                categoryId: membership.categoryId,
                lessonOrder: membership.lessonOrder,
              })),
          };
        });
      } catch (categoryError) {
        console.error('Unable to enrich student practice lessons with categories:', categoryError);
      }
    }

    const userProgressMap: Record<string, UserProgress> = {};

    if (currentUser) {
      const progressSnapshot = await adminDb.collection('userProgress').where('userId', '==', currentUser.uid).get();

      progressSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const lessonId = data.lessonId || doc.id.split('_')[1];
        if (lessonId) {
          userProgressMap[lessonId] = data as UserProgress;
        }
      });
    }

    const normalLessons = allLessons.filter(l => l.type === 'normal');
    const vocabLessons = allLessons.filter(l => l.type === 'vocab');
    const diagrammingLessons = allLessons.filter(l => l.type === 'sentence-diagramming');
    const listeningLessons = allLessons.filter(l => l.type === 'listening');

    const isLockingDisabled = process.env.NEXT_PUBLIC_DISABLE_PROGRESSION_LOCK === 'true';

    const getStatusFromProgress = (
      userProgress: UserProgress | undefined,
      lesson: (typeof allLessons)[number]
    ): { status: string; progress: number } => {
      if (userProgress) {
        const totalPages = lesson.pages.length;
        const progress = calculateStoredProgress(userProgress, totalPages);
        const status = isStoredLessonComplete(userProgress, totalPages) ? 'completed' : 'in-progress';
        return { status, progress };
      }
      return { status: 'available', progress: 0 };
    };

    const withProgress = (
      lesson: (typeof allLessons)[number],
      status: string,
      progress: number
    ): LessonWithProgress => {
      const userProgress = userProgressMap[lesson.id];
      const furthestPageIndex = getFurthestPageIndex(userProgress, lesson.pages.length);
      return {
        ...lesson,
        progress,
        status,
        furthestPageIndex,
        currentPageIndex: Math.max(furthestPageIndex, 0),
        exerciseProgress: userProgress?.exerciseProgress || [],
        completedAt: userProgress?.completedAt,
        score: userProgress?.score,
        lastAccessedAt: userProgress?.lastAccessedAt,
        progressSchemaVersion: userProgress?.progressSchemaVersion,
      } as LessonWithProgress;
    };

    const processNormalLessons = (lessons: typeof allLessons): LessonWithProgress[] => {
      return lessons.map((lesson, index) => {
        const userProgress = userProgressMap[lesson.id];
        let status = 'locked';
        let progress = 0;

        if (isLockingDisabled) {
          const result = getStatusFromProgress(userProgress, lesson);
          status = result.status;
          progress = result.progress;
        } else if (index === 0) {
          const result = getStatusFromProgress(userProgress, lesson);
          status = result.status;
          progress = result.progress;
        } else {
          const previousLesson = lessons[index - 1];
          const previousProgress = userProgressMap[previousLesson.id];

          if (isStoredLessonComplete(previousProgress, previousLesson.pages.length)) {
            const result = getStatusFromProgress(userProgress, lesson);
            status = result.status;
            progress = result.progress;
          }
        }

        return withProgress(lesson, status, progress);
      });
    };

    const processPracticeLessons = (lessons: typeof allLessons): LessonWithProgress[] => {
      return lessons.map(lesson => {
        const userProgress = userProgressMap[lesson.id];
        const result = getStatusFromProgress(userProgress, lesson);
        return withProgress(lesson, result.status, result.progress);
      });
    };

    const lessonsWithStatus: LessonWithProgress[] = [
      ...processNormalLessons(normalLessons),
      ...processPracticeLessons(vocabLessons),
      ...processPracticeLessons(diagrammingLessons),
      ...processPracticeLessons(listeningLessons),
    ];

    return NextResponse.json({ lessons: lessonsWithStatus });
  } catch (error) {
    console.error('Error fetching live lessons:', error);
    return NextResponse.json({ error: 'Failed to fetch lessons' }, { status: 500 });
  }
}
