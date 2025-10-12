import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/src/services/firebase-admin';
import { mapLegacyWordV4 } from '@/src/services/migrations/vocabularyMapping-v4';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!token) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    await adminAuth.verifyIdToken(token);

    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean(body?.dryRun);
    const limit = typeof body?.limit === 'number' ? body.limit : undefined;
    const targetCollection =
      typeof body?.targetCollection === 'string' && body.targetCollection
        ? body.targetCollection
        : 'vocabulary_words_v4';

    console.info('[migration] Starting migration run', { dryRun, targetCollection, limit });

    const baseRef = adminDb.collection('vocabulary_words');
    const snap = limit ? await baseRef.limit(limit).get() : await baseRef.get();

    let migrated = 0;
    let skipped = 0;
    const errors: Array<{ id: string; word: string; part_of_speech: string; reason: string }> = [];
    const warnings: Array<{ id: string; word: string; part_of_speech: string; message: string }> = [];
    const byPartOfSpeech: Record<string, { migrated: number; skipped: number }> = {};

    let batch = adminDb.batch();
    let ops = 0;
    const BATCH_SIZE = 50; // Reduced from 400 due to large document sizes

    for (const doc of snap.docs) {
      const data = doc.data();
      const wordName = String(data['word'] || 'unknown');
      const pos = String(data['part_of_speech'] || data['partOfSpeech'] || data['wordType'] || 'unknown');

      if (!byPartOfSpeech[pos]) {
        byPartOfSpeech[pos] = { migrated: 0, skipped: 0 };
      }

      let result;
      try {
        result = mapLegacyWordV4(data);
      } catch (mappingError) {
        console.error(`[migration] Mapping error for ${doc.id} (${wordName}):`, mappingError);
        skipped++;
        byPartOfSpeech[pos].skipped++;
        errors.push({
          id: doc.id,
          word: wordName,
          part_of_speech: pos,
          reason: `Mapping threw error: ${mappingError instanceof Error ? mappingError.message : String(mappingError)}`,
        });
        continue;
      }

      if (!result.success) {
        skipped++;
        byPartOfSpeech[pos].skipped++;
        errors.push({
          id: doc.id,
          word: result.word || wordName,
          part_of_speech: pos,
          reason: result.reason,
        });

        // Log detailed validation errors for debugging
        if (dryRun) {
          console.error(`[migration] Validation failed for ${doc.id}:`, {
            word: wordName,
            reason: result.reason,
            originalData: JSON.stringify(data, null, 2),
          });
        }
        continue;
      }

      const mapped = result.data;

      if (pos === 'noun') {
        const hasNomSing = mapped['nominative_singular'];
        const hasGenSing = mapped['genitive_singular'];
        if (!hasNomSing || !hasGenSing) {
          warnings.push({
            id: doc.id,
            word: wordName,
            part_of_speech: pos,
            message:
              `Missing principal parts: ${!hasNomSing ? 'nominative_singular' : ''} ${!hasGenSing ? 'genitive_singular' : ''}`.trim(),
          });
        }
      }

      if (pos === 'verb') {
        const principalParts = mapped['principal_parts'] as Array<{ full_form: string; shortened_form: string }> | null;
        if (!principalParts || principalParts.length === 0) {
          warnings.push({
            id: doc.id,
            word: wordName,
            part_of_speech: pos,
            message: 'Missing principal_parts',
          });
        } else if (principalParts.length < 4) {
          warnings.push({
            id: doc.id,
            word: wordName,
            part_of_speech: pos,
            message: `Only ${principalParts.length} principal parts (expected 4)`,
          });
        }
      }

      if (dryRun) {
        // In dry run, log what would be migrated
        console.info(`[DRY RUN] Would migrate ${doc.id} (${wordName}):`, {
          part_of_speech: pos,
          hasRequiredFields: true,
          targetCollection,
        });
      } else {
        console.info('[migration] Queueing document for write', {
          id: doc.id,
          word: wordName,
          part_of_speech: pos,
          targetCollection,
        });
        // Use merge: false for full replacement (v3 has required fields)
        batch.set(adminDb.collection(targetCollection).doc(doc.id), mapped, { merge: false });
        ops++;
        if (ops >= BATCH_SIZE) {
          try {
            await batch.commit();
            console.info('[migration] Committed batch', {
              size: ops,
              progress: `${migrated}/${snap.size}`,
              targetCollection,
            });
          } catch (batchError) {
            console.error('[migration] Batch commit failed:', batchError);
            throw new Error(
              `Batch commit failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`
            );
          }
          batch = adminDb.batch();
          ops = 0;
        }
      }
      migrated++;
      byPartOfSpeech[pos].migrated++;
    }

    if (!dryRun && ops > 0) {
      try {
        await batch.commit();
        console.info('[migration] Committed final batch', { size: ops, targetCollection });
      } catch (batchError) {
        console.error('[migration] Final batch commit failed:', batchError);
        throw new Error(
          `Final batch commit failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`
        );
      }
    }

    console.info('[migration] Migration run complete', {
      dryRun,
      migrated,
      skipped,
      warnings: warnings.length,
      errors: errors.length,
      targetCollection,
    });

    return NextResponse.json({
      success: true,
      data: {
        total: snap.size,
        attempted: snap.size,
        migrated,
        skipped,
        targetCollection,
        dryRun,
        byPartOfSpeech,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        summary: {
          errorsCount: errors.length,
          warningsCount: warnings.length,
          successRate: snap.size > 0 ? ((migrated / snap.size) * 100).toFixed(2) + '%' : '0%',
        },
      },
    });
  } catch (error) {
    console.error('[migration] Fatal error during migration:', error);
    if (error instanceof Error) {
      console.error('[migration] Error stack:', error.stack);
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
