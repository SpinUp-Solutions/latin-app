/** Minimal response shape exercised by route unit tests. */
export const NextResponse = {
  json: (body: unknown, init?: { status?: number }) => ({
    body,
    status: init?.status ?? 200,
  }),
};

export const mockNextResponse = NextResponse;

/** Default Firebase Admin surface for tests that inject their own database. */
export const adminAuth = {};
export const adminDb = {};
export const mockFirebaseAdmin = { adminAuth, adminDb };
