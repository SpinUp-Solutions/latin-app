import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/src/services/firebase-admin';
import { verifyAdminAccess } from '@/src/lib/verifyAdminAccess';
import type { TestDefinition } from '@/src/types/test';
import { validateTestDefinition } from '@/src/utils/testDefinition';
import { testRouteErrorResponse } from '../errorResponse';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const document = await adminDb.collection('tests').doc(id).get();
    if (!document.exists) return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    return NextResponse.json({ test: { id: document.id, ...document.data() } });
  } catch (error) {
    return testRouteErrorResponse(error, 'fetch');
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const ref = adminDb.collection('tests').doc(id);
    const existing = await ref.get();
    if (!existing.exists) return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const body = { ...(await request.json()), id };
    const validation = validateTestDefinition(body);
    if (!validation.test) return NextResponse.json({ error: validation.errors.join('. ') }, { status: 400 });

    const previous = existing.data() as Partial<TestDefinition>;
    const test: TestDefinition = {
      ...validation.test,
      createdAt: previous.createdAt,
      createdBy: previous.createdBy,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid,
      version: (previous.version || 0) + 1,
    };
    await ref.set(test);
    return NextResponse.json({ success: true, test });
  } catch (error) {
    return testRouteErrorResponse(error, 'update');
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await verifyAdminAccess(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const ref = adminDb.collection('tests').doc(id);
    if (!(await ref.get()).exists) return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    return testRouteErrorResponse(error, 'delete');
  }
}
