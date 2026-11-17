import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { adminDb } from '@/src/services/firebase-admin';
import { forgetVocabularyAIRule } from '@/src/lib/vocabulary-ai-guidance/persistence.server';

const RuleIdSchema = z.string().trim().min(1).max(100);

/** Removes one rule for all words, such as one the admin undid right after the AI learned it. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await verifyAdminAccess(request);
    const id = RuleIdSchema.parse((await params).id);
    return NextResponse.json(await forgetVocabularyAIRule(adminDb, actor.uid, id));
  } catch (error) {
    return routeErrorResponse(error, 'remove the AI rule');
  }
}
