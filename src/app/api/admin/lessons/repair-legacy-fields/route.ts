import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb, adminStorage } from '@/src/services/firebase-admin';
import {
  LegacyLearningUnitRepairOperationError,
  runLegacyLearningUnitRepairOperation,
} from '@/src/lib/learning-units/legacy-field-repair-operation';
import { LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID } from '@/src/lib/learning-units/legacy-field-repair';
import { GcloudProjectAccessError, verifyGcloudProjectAccess } from '@/src/lib/verifyGcloudProjectAccess';

const requestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('dry-run') }).strict(),
  z.object({ mode: z.literal('verify') }).strict(),
  z
    .object({
      mode: z.literal('apply'),
      planHash: z.string().regex(/^[a-f0-9]{64}$/),
      confirmation: z.literal('APPLY_LEGACY_LEARNING_UNIT_FIELD_REPAIR'),
    })
    .strict(),
]);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (projectId !== LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID) {
      throw new LegacyLearningUnitRepairOperationError(
        `Refusing to run outside ${LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID}`,
        503
      );
    }

    const operator = await verifyGcloudProjectAccess(request, projectId);
    const input = requestSchema.parse((await request.json().catch(() => ({}))) as unknown);
    const result = await runLegacyLearningUnitRepairOperation({
      db: adminDb,
      storage: adminStorage,
      projectId,
      operator,
      request: input,
    });

    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid migration request', issues: error.issues },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (error instanceof GcloudProjectAccessError || error instanceof LegacyLearningUnitRepairOperationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    console.error('Legacy learning-unit field repair failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Legacy learning-unit field repair failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
