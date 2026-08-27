export function shouldFetchNextSearchPage({
  hasCursor,
  isFetching,
  searchPending,
}: {
  hasCursor: boolean;
  isFetching: boolean;
  searchPending: boolean;
}) {
  return hasCursor && !isFetching && !searchPending;
}
