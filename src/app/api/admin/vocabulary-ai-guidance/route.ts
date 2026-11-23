import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import { routeErrorResponse } from '@/src/lib/route-error-response';
import { adminDb } from '@/src/services/firebase-admin';
import {
  readVocabularyAIGuidance,
  saveVocabularyAIGuidance,
} from '@/src/lib/vocabulary-ai-guidance/persistence.server';

export async function GET(request: NextRequest) {
  try {
    await verifyAdminAccess(request);
    return NextResponse.json(await readVocabularyAIGuidance(adminDb));
  } catch (error) {
    return routeErrorResponse(error, 'read vocabulary AI guidance');
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await verifyAdminAccess(request);
    return NextResponse.json(await saveVocabularyAIGuidance(adminDb, actor.uid, await request.json()));
  } catch (error) {
    return routeErrorResponse(error, 'save vocabulary AI guidance');
  }
}
