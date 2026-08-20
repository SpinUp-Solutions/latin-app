import type { AppDispatch, RootState } from '@/src/store';
import { lessonApi } from './lessonApi';
import type { StudentDashboard } from '@/src/types/lesson';

/**
 * Cross-load dashboard cache: the last dashboard response per student is
 * persisted to localStorage, rehydrated into the RTK Query cache as soon as
 * the auth uid is known, and revalidated by a forced background refetch. The
 * dashboard paints instantly with the persisted projection while the fresh
 * one is in flight.
 */

const CACHE_VERSION = 'v1';
const cacheKey = (uid: string) => `latin-app:student-dashboard:${CACHE_VERSION}:${uid}`;

const isBrowser = () => typeof window !== 'undefined';

const isPersistableDashboard = (value: unknown): value is StudentDashboard =>
  Boolean(value) &&
  typeof value === 'object' &&
  Array.isArray((value as StudentDashboard).learningPath) &&
  Array.isArray((value as StudentDashboard).practiceLessons);

export function persistStudentDashboard(uid: string, dashboard: StudentDashboard): void {
  if (!isBrowser() || !uid) return;
  try {
    window.localStorage.setItem(cacheKey(uid), JSON.stringify(dashboard));
  } catch {
    // Quota exceeded or unavailable storage: the in-memory cache still works.
  }
}

export function readPersistedStudentDashboard(uid: string): StudentDashboard | null {
  if (!isBrowser() || !uid) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPersistableDashboard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPersistedStudentDashboard(uid: string): void {
  if (!isBrowser() || !uid) return;
  try {
    window.localStorage.removeItem(cacheKey(uid));
  } catch {
    // Nothing meaningful to do without storage access.
  }
}

/** The uid already seeded in this page session, so a repeated auth event can
 * never overwrite fresher in-memory data with the persisted projection. */
let seededUid: string | null = null;

const persistOnSuccess =
  (uid: string) =>
  (result: { data?: StudentDashboard }): void => {
    if (seededUid === uid && result.data) persistStudentDashboard(uid, result.data);
  };

/**
 * Hydrates the RTK Query cache with the persisted dashboard and revalidates it
 * in the background (stale-while-revalidate on app boot).
 *
 * Dispatch as a thunk: `dispatch(seedStudentDashboardCache(uid))`.
 *
 * Ordering hazards this coordinator guards against (RTK Query drops a
 * condition-rejected `initiate` while another request for the same cache key
 * is pending, and a late `upsertQueryData` can overwrite fresh data):
 *
 * - If a real request for the dashboard is already in flight (e.g. the page
 *   hook beat the auth listener), it is reused — no duplicate fetch, no
 *   seeding — and its result is persisted when it lands.
 * - If fresh data is already in memory, nothing is seeded or fetched: the
 *   persisted projection can only be older.
 * - Otherwise the persisted projection is inserted synchronously via
 *   `upsertQueryEntries` (not `upsertQueryData`, whose thunk stays pending
 *   across a microtask and silently swallows the forced refetch below), so
 *   the very first dashboard render has data.
 * - The seeded entry is stamped "fulfilled now", which suppresses the page
 *   hook's own mount-time fetch — the forced revalidation dispatched here is
 *   therefore the single guaranteed network refresh of the seeded value.
 */
export const seedStudentDashboardCache =
  (uid: string) =>
  (dispatch: AppDispatch, getState: () => RootState): void => {
    if (!uid || seededUid === uid) return;
    seededUid = uid;

    const running = dispatch(lessonApi.util.getRunningQueryThunk('getStudentDashboard', uid));
    if (running) {
      const restorePersistedFallback = () => {
        if (seededUid !== uid) return;
        const current = lessonApi.endpoints.getStudentDashboard.select(uid)(getState());
        const persisted = readPersistedStudentDashboard(uid);
        if (current.data === undefined && persisted) {
          // Once a query entry has reached `rejected`, the synchronous entry
          // upsert does not replace it. The thunk form transitions that cache
          // key back through pending to fulfilled with the persisted value.
          void dispatch(lessonApi.util.upsertQueryData('getStudentDashboard', uid, persisted)).catch(() => {});
        }
      };

      void running
        .then((result: { data?: StudentDashboard }) => {
          if (seededUid !== uid) return;
          if (result.data) {
            persistStudentDashboard(uid, result.data);
            return;
          }

          // RTK Query resolves rejected requests with `{ error }` rather than
          // rejecting the promise. If the request that beat cache seeding
          // fails, restore the persisted projection as the offline fallback.
          restorePersistedFallback();
        })
        .catch(restorePersistedFallback);
      return;
    }

    const current = lessonApi.endpoints.getStudentDashboard.select(uid)(getState());
    if (current.data !== undefined) return;

    const persisted = readPersistedStudentDashboard(uid);
    if (!persisted) return; // Nothing to hydrate: the page hook fetches on mount.

    dispatch(lessonApi.util.upsertQueryEntries([{ endpointName: 'getStudentDashboard', arg: uid, value: persisted }]));

    const refresh = dispatch(
      lessonApi.endpoints.getStudentDashboard.initiate(uid, {
        subscribe: false,
        forceRefetch: true,
      })
    );
    void refresh.then(persistOnSuccess(uid)).catch(() => {
      // A failed background revalidation keeps the persisted data on screen.
    });
  };

export function resetStudentDashboardCacheSeed(): void {
  seededUid = null;
}
