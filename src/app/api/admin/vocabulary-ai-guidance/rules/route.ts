import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { adminDb } from '@/src/services/firebase-admin';
import { learnVocabularyAIRule } from '@/src/lib/vocabulary-ai-guidance/persistence.server';

/** Saves a rule for all words that the AI drew from an admin's answer, once the admin accepts the answer. */
export async function POST(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    return NextResponse.json(await learnVocabularyAIRule(adminDb, actor.uid, await request.json()));
  } catch (error) {
    return routeErrorResponse(error, 'save the rule the AI learned');
  }
}
