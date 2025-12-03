import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Admin route protection is handled by:
  // - withAdminAuth HOC (client-side)
  // - verifyAdminAccess (API routes)
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
