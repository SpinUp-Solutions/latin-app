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

export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    const input = learningPathMigrationActionSchema.parse(
      await request.json().catch(() => null)
    );

    switch (input.action) {
      case 'dry-run':
        return NextResponse.json({
          manifest: await learningPathService.buildMigrationManifest(input.migrationId),
        });
      case 'apply':
        return NextResponse.json(await learningPathService.applyMigration(input.manifest, actor.uid));
      case 'verify': {
        await learningPathService.verifyMigration(input.manifest);
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
        assertLearningPathProjectionParity(
          input.manifest.unitIds,
          adminProjection.effectiveUnitIds,
          studentUnitIds
        );
        // Close the projection-check race by requiring the reviewed manifest to
        // still be the active stored state after both production projections ran.
        return NextResponse.json(
          await learningPathService.verifyMigration(input.manifest)
        );
      }
      case 'rollback':
        return NextResponse.json({
          path: await learningPathService.rollbackMigration(actor.uid),
        });
      case 'retire':
        return NextResponse.json({
          path: await learningPathService.retireMigration(actor.uid),
        });
    }
  } catch (error) {
    return learningPathRouteErrorResponse(error, 'run Learning Path migration command');
  }
}
