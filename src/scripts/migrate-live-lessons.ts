import { adminDb } from '@/src/services/firebase-admin';

export async function migrateLiveLessonsToUnified() {
  console.log('Starting live lessons migration...');

  const liveLessonsSnapshot = await adminDb.collection('live_lessons').get();
  const allLessonsSnapshot = await adminDb.collection('lessons').get();

  const batch = adminDb.batch();
  const liveIds = new Set<string>();

  for (const doc of liveLessonsSnapshot.docs) {
    const liveLesson = doc.data();
    liveIds.add(liveLesson.lessonId);

    const lessonRef = adminDb.collection('lessons').doc(liveLesson.lessonId);
    batch.update(lessonRef, {
      isLive: true,
      liveOrder: liveLesson.order,
      publishedAt: liveLesson.publishedAt,
      publishedBy: liveLesson.publishedBy,
    });
  }

  for (const doc of allLessonsSnapshot.docs) {
    if (!liveIds.has(doc.id)) {
      batch.update(doc.ref, {
        isLive: false,
        liveOrder: null,
        publishedAt: null,
        publishedBy: null,
      });
    }
  }

  await batch.commit();
  console.log(`Migrated ${liveLessonsSnapshot.size} live lessons`);
}

export async function validateMigration() {
  const lessons = await adminDb.collection('lessons').get();
  const liveLessons = lessons.docs.filter(doc => doc.data().isLive);

  console.log(`Total lessons: ${lessons.size}`);
  console.log(`Live lessons: ${liveLessons.length}`);

  const orderedLive = liveLessons
    .map(doc => ({ id: doc.id, order: doc.data().liveOrder }))
    .sort((a, b) => a.order - b.order);

  console.log('Live lesson order:', orderedLive);
}

export async function cleanupLiveLessonsCollection() {
  console.log('⚠️  DESTRUCTIVE: Deleting live_lessons collection');
  const snapshot = await adminDb.collection('live_lessons').get();

  const batch = adminDb.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));

  await batch.commit();
  console.log(`Deleted ${snapshot.size} documents from live_lessons`);
}
