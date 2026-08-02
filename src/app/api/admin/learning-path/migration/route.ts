import { NextRequest, NextResponse } from 'next/server';
import { learningPathRouteErrorResponse } from '@/src/lib/learning-units/learning-path-api';
import {
  assertLearningPathProjectionParity,
  LearningPathServiceError,
  learningPathService,
} from '@/src/lib/learning-units/learning-path-service';
import { studentDashboardService } from '@/src/lib/learning-units/student-dashboard-service';
import { learningPathMigrationActionSchema } from '@/src/lib/learning-units/schemas';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';

export const dynamic = 'force-dynamic';

async function verifyStoredMigration(migrationId: string, actorId: string) {
  const migration = await learningPathService.requireMigrationRecord(migrationId);
  await learningPathService.verifyMigration(migration.manifest);
  const [adminProjection, studentUnitIds] = await Promise.all([
    learningPathService.getAdminView(),
    studentDashboardService.getNormalSequenceUnitIds(),
  ]);
  if (adminProjection.source !== 'learning-path') {
    throw new LearningPathServiceError(
      'VERIFICATION_FAILED',
      'The Learning Path is not active in the admin projection',
      409
    );
  }
  assertLearningPathProjectionParity(migration.manifest.unitIds, adminProjection.effectiveUnitIds, studentUnitIds);
  // Close the projection-check race by requiring the reviewed manifest to
  // still be the active stored state after both production projections ran.
  return learningPathService.verifyMigration(migration.manifest, actorId);
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json(await learningPathService.getMigrationOverview());
  } catch (error) {
    return learningPathRouteErrorResponse(error, 'load Learning Path migration workflow');
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = learningPathMigrationActionSchema.parse(await request.json().catch(() => null));

    switch (input.action) {
      case 'dry-run': {
        const migration = await learningPathService.prepareMigration(input.migrationId, actor.uid);
        return NextResponse.json({
          manifest: migration.manifest,
          migration,
          workflow: await learningPathService.getMigrationOverview(),
        });
      }
      case 'recover': {
        const migration = await learningPathService.recoverMigration(actor.uid);
        return NextResponse.json({
          migration,
          workflow: await learningPathService.getMigrationOverview(),
        });
      }
      case 'apply': {
        const migration = await learningPathService.requireMigrationRecord(input.migrationId);
        const result = await learningPathService.applyMigration(migration.manifest, actor.uid, true);
        return NextResponse.json({
          ...result,
          workflow: await learningPathService.getMigrationOverview(),
        });
      }
      case 'verify': {
        const result = await verifyStoredMigration(input.migrationId, actor.uid);
        return NextResponse.json({
          ...result,
          workflow: await learningPathService.getMigrationOverview(),
        });
      }
      case 'rollback':
        return NextResponse.json({
          path: await learningPathService.rollbackMigration(actor.uid, input.migrationId),
          workflow: await learningPathService.getMigrationOverview(),
        });
      case 'retire': {
        // Retirement is irreversible, so always rerun the complete verification
        // immediately before removing the legacy cutover metadata.
        const verification = await verifyStoredMigration(input.migrationId, actor.uid);
        return NextResponse.json({
          path: await learningPathService.retireMigration(actor.uid, input.migrationId),
          verification,
          workflow: await learningPathService.getMigrationOverview(),
        });
      }
    }
  } catch (error) {
    return learningPathRouteErrorResponse(error, 'run Learning Path migration command');
  }
}
