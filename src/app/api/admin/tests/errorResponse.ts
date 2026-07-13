import { NextResponse } from 'next/server';
import { AdminAccessError } from '@/src/lib/verifyAdminAccess';

export const testRouteErrorResponse = (error: unknown, action: string) => {
  if (error instanceof AdminAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(`Error ${action} test:`, error);
  return NextResponse.json({ error: `Failed to ${action} test` }, { status: 500 });
};
