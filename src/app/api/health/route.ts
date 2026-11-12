import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Unauthenticated on purpose: when a Firebase token refresh fails, the client
// calls this to tell "no connection" apart from "Google's servers are blocked".
export function GET() {
  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
