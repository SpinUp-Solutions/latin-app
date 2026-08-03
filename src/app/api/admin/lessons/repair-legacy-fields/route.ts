import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Firestore } from 'firebase-admin/firestore';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import {
  LegacyLearningUnitRepairOperationError,
  runLegacyLearningUnitRepairOperation,
} from '@/src/lib/learning-units/legacy-field-repair-operation';
import {
  LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID,
  LEGACY_LEARNING_UNIT_REPAIR_STORAGE_BUCKET,
} from '@/src/lib/learning-units/legacy-field-repair';
import {
  GcloudProjectAccessError,
  verifyGcloudProjectAccess,
  verifyGcloudStorageAccess,
} from '@/src/lib/verifyGcloudProjectAccess';

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
    const operator = await verifyGcloudProjectAccess(request, LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID);
    await verifyGcloudStorageAccess(operator, LEGACY_LEARNING_UNIT_REPAIR_STORAGE_BUCKET);
    const input = requestSchema.parse((await request.json().catch(() => ({}))) as unknown);
    const oauth = new OAuth2Client();
    oauth.setCredentials({ access_token: operator.accessToken });
    const auth = new GoogleAuth({ projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID, authClient: oauth });
    const db = new Firestore({ projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID, auth } as never);
    const storage = new Storage({ projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID, authClient: auth as never });
    let result;
    try {
      result = await runLegacyLearningUnitRepairOperation({
        db,
        storage,
        projectId: LEGACY_LEARNING_UNIT_REPAIR_PROJECT_ID,
        operator,
        request: input,
      });
    } finally {
      await db.terminate();
    }

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
