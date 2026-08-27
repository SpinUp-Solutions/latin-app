import { shouldFetchNextSearchPage } from '@/src/lib/paginated-search';

describe('shouldFetchNextSearchPage', () => {
  it('loads the next page only when a cursor is ready and search is not pending', () => {
    expect(shouldFetchNextSearchPage({ hasCursor: true, isFetching: false, searchPending: false })).toBe(true);
  });

  it('does not page while a new search has not been committed', () => {
    expect(shouldFetchNextSearchPage({ hasCursor: true, isFetching: false, searchPending: true })).toBe(false);
  });

  it('does not page while a request is already in flight', () => {
    expect(shouldFetchNextSearchPage({ hasCursor: true, isFetching: true, searchPending: false })).toBe(false);
  });

  it('does not page without a cursor', () => {
    expect(shouldFetchNextSearchPage({ hasCursor: false, isFetching: false, searchPending: false })).toBe(false);
  });
});
