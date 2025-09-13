import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import {
  migrateLiveLessonsToUnified,
  validateMigration,
  cleanupLiveLessonsCollection,
} from '@/src/scripts/migrate-live-lessons';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await request.json();

    switch (action) {
      case 'migrate':
        await migrateLiveLessonsToUnified();
        return NextResponse.json({ success: true, message: 'Migration completed' });

      case 'validate':
        await validateMigration();
        return NextResponse.json({ success: true, message: 'Validation completed' });

      case 'cleanup':
        await cleanupLiveLessonsCollection();
        return NextResponse.json({ success: true, message: 'Cleanup completed' });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 });
  }
}
