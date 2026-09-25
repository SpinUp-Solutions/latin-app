jest.mock('@/src/services/firebase-admin', () => ({ adminDb: {} }));
jest.mock('firebase-admin/firestore', () => ({ FieldPath: { documentId: () => '__name__' } }));
jest.mock('@/src/lib/learning-units/student-dashboard-service', () => ({ studentDashboardService: { getDashboard: jest.fn() } }));

import { applyDateAndCursor, decodeCursor, encodeCursor } from '@/src/lib/student-feedback/admin.server';

const base = {
  status: 'unresolved' as const,
  archived: 'false' as const,
  sort: 'newest' as const,
  from: '2026-09-23T00:00:00.000Z',
  to: '2026-09-24T00:00:00.000Z',
};

class FakeOrderedQuery {
  readonly calls: Array<[string, ...unknown[]]> = [];
  startAt(...values: unknown[]) { this.calls.push(['startAt', ...values]); return this; }
  startAfter(...values: unknown[]) { this.calls.push(['startAfter', ...values]); return this; }
  endAt(...values: unknown[]) { this.calls.push(['endAt', ...values]); return this; }
}

describe('admin feedback cursor integrity', () => {
  it('binds cursors to filters and report or activity scope', () => {
    const cursor = encodeCursor(base, base.to, 'report-2');
    expect(decodeCursor(cursor, base)).toEqual({ createdAt: base.to, id: 'report-2' });
    expect(() => decodeCursor(cursor, { ...base, status: 'resolved' })).toThrow('does not match');
    expect(() => decodeCursor(cursor, base, 'activity:report-2')).toThrow('does not match');
    const activityCursor = encodeCursor(base, base.to, 'note-1', 'activity:report-2');
    expect(() => decodeCursor(activityCursor, base, 'activity:report-3')).toThrow('does not match');
  });

  it('rejects a page cursor outside the immutable date range', () => {
    const older = encodeCursor(base, '2026-09-22T23:59:59.999Z', 'report-1');
    const later = encodeCursor(base, '2026-09-24T00:00:00.001Z', 'report-1');
    expect(() => decodeCursor(older, base)).toThrow('does not match');
    expect(() => decodeCursor(later, base)).toThrow('does not match');
  });

  it('uses inclusive timestamp-only bounds and stable timestamp plus ID page cursors', () => {
    const first = new FakeOrderedQuery();
    applyDateAndCursor(first as never, base);
    expect(first.calls).toEqual([['startAt', base.to], ['endAt', base.from]]);

    const next = new FakeOrderedQuery();
    applyDateAndCursor(next as never, { ...base, cursor: encodeCursor(base, base.to, 'report-2') });
    expect(next.calls).toEqual([['startAfter', base.to, 'report-2'], ['endAt', base.from]]);

    const oldest = new FakeOrderedQuery();
    applyDateAndCursor(oldest as never, { ...base, sort: 'oldest' });
    expect(oldest.calls).toEqual([['startAt', base.from], ['endAt', base.to]]);
  });

  it('rejects reversed dates with a stable client error', () => {
    const query = new FakeOrderedQuery();
    expect(() => applyDateAndCursor(query as never, { ...base, from: base.to, to: base.from })).toThrow('start date');
  });
});
