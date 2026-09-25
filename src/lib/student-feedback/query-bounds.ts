/** Keep Firestore cursor construction independent of the admin service for SDK-level tests. */
export interface FeedbackBoundedQuery<Q> {
  startAt(...values: unknown[]): Q;
  startAfter(...values: unknown[]): Q;
  endAt(...values: unknown[]): Q;
}

export interface FeedbackDateBounds {
  sort: 'newest' | 'oldest';
  from?: string;
  to?: string;
  cursor?: { createdAt: string; id: string } | null;
}

export function applyFeedbackDateBounds<Q extends FeedbackBoundedQuery<Q>>(query: Q, bounds: FeedbackDateBounds): Q {
  if (bounds.cursor) {
    query = query.startAfter(bounds.cursor.createdAt, bounds.cursor.id);
  } else if (bounds.sort === 'oldest' && bounds.from) {
    query = query.startAt(bounds.from);
  } else if (bounds.sort === 'newest' && bounds.to) {
    query = query.startAt(bounds.to);
  }
  if (bounds.sort === 'oldest' && bounds.to) query = query.endAt(bounds.to);
  if (bounds.sort === 'newest' && bounds.from) query = query.endAt(bounds.from);
  return query;
}
