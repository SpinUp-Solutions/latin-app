import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

const serializeFirestoreValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  if (value && typeof value === 'object') {
    if ('toDate' in value && typeof value.toDate === 'function') {
      return value.toDate().toISOString();
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        serializeFirestoreValue(nestedValue),
      ])
    );
  }

  return value;
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const snapshot = await adminDb.collection('lessons').get();

    const lessons = snapshot.docs
      .map(doc => {
        const serializedData = serializeFirestoreValue(doc.data()) as Record<string, unknown>;

        return {
          id: doc.id,
          ...serializedData,
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));

    const exportedAt = new Date().toISOString();
    const timestamp = exportedAt.replace(/[:.]/g, '-').slice(0, -5);
    const filename = `lessons-backup-${timestamp}.json`;

    const payload = {
      exportedAt,
      exportedBy: user.uid,
      totalLessons: lessons.length,
      lessons,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error creating lessons backup:', error);

    if (error instanceof Error) {
      if (error.message === 'Unauthorized' || error.message === 'Forbidden') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
