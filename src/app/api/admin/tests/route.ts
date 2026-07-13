import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import type { TestDefinition } from '@/src/types/test';
import { toTestSummary, validateTestDefinition } from '@/src/utils/testDefinition';
import { testRouteErrorResponse } from './errorResponse';

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const snapshot = await adminDb.collection('tests').orderBy('updatedAt', 'desc').get();
    return NextResponse.json({
      tests: snapshot.docs.map(doc => toTestSummary(doc.id, doc.data() as Partial<TestDefinition>)),
    });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const validation = validateTestDefinition(await request.json());
    if (!validation.test) return NextResponse.json({ error: validation.errors.join('. ') }, { status: 400 });

    const ref = adminDb.collection('tests').doc(validation.test.id);
    if ((await ref.get()).exists) {
      return NextResponse.json({ error: 'A test with this ID already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const test: TestDefinition = {
      ...validation.test,
      createdAt: now,
      createdBy: user.uid,
      updatedAt: now,
      updatedBy: user.uid,
      version: 1,
    };
    await ref.set(test);
    return NextResponse.json({ success: true, test }, { status: 201 });
  } catch (error) {
    return testRouteErrorResponse(error, 'create');
  }
}
