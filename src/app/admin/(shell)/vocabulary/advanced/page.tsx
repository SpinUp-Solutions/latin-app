'use client';

import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Filter } from 'lucide-react';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminIconChip } from '@/src/components/admin/shell';
import { useGetAdvancedWordsQuery } from '@/src/store/api/advancedVocabularyApi';
import {
  selectAdvancedFilters,
  selectAdvancedPagination,
  selectAdvancedSelection,
  updateFilters,
  resetFilters,
  setLastWordId,
  toggleCellPath,
  addCellPaths,
  removeCellPaths,
  clearSelection,
} from '@/src/store/slices/advancedFiltersSlice';
import { AdvancedFiltersPanel } from '@/src/components/ui/admin/vocabulary/AdvancedFiltersPanel';
import { AdvancedResultsList } from '@/src/components/ui/admin/vocabulary/AdvancedResultsList';
import { FormSelectionTable } from '@/src/components/ui/admin/vocabulary/FormSelectionTable';
import { useDebounce } from '@/src/hooks/useDebounce';
import { useFormSelection } from '@/src/hooks/useFormSelection';
import { VOCABULARY_WORDS_COLLECTION } from '@/shared/constants/firestore';

const TARGET_COLLECTION = VOCABULARY_WORDS_COLLECTION;

function AdvancedFiltersPage() {
  const dispatch = useDispatch();
  const filters = useSelector(selectAdvancedFilters);
  const pagination = useSelector(selectAdvancedPagination);
  const selection = useSelector(selectAdvancedSelection);
  const debouncedSearch = useDebounce(filters.search, 300);
  const formSelection = useFormSelection();

  const { limit, ...poolFilters } = filters;
  const fetchAll = limit === 'all';

  const { data, isLoading, isFetching, isError } = useGetAdvancedWordsQuery({
    collection: TARGET_COLLECTION,
    filters: { ...poolFilters, search: debouncedSearch },
    lastWordId: pagination.lastWordId,
    limit: fetchAll ? undefined : limit,
    fetchAll,
    cellPaths: selection.selectedCellPaths,
    tableType: selection.selectedTableType ?? undefined,
  });
  const words = data?.words ?? [];
  const totalCount = data?.totalCount;
  const hasMore = fetchAll ? false : (data?.hasMore ?? false);
  const loadingMore = fetchAll ? false : isFetching && pagination.lastWordId !== null;

  useEffect(() => {
    dispatch(setLastWordId(null));
  }, [
    filters.partOfSpeech,
    debouncedSearch,
    filters.verbConjugation,
    filters.isDeponent,
    filters.nounDeclension,
    filters.adjectiveDeclension,
    filters.pronounType,
    filters.pronounPerson,
    filters.limit,
    dispatch,
  ]);

  const handleFiltersChange = (updates: Partial<typeof filters>) => {
    dispatch(updateFilters(updates));
  };

  const handleReset = () => {
    dispatch(resetFilters());
  };

  const handleApply = () => {
    dispatch(setLastWordId(null));
  };

  const handleLoadMore = () => {
    if (fetchAll) {
      return;
    }
    if (data?.lastWordId) {
      dispatch(setLastWordId(data.lastWordId));
    }
  };

  const handleToggleCell = (path: string) => {
    dispatch(toggleCellPath(path));
  };

  const handleTogglePaths = (paths: string[]) => {
    const selectedSet = new Set(selection.selectedCellPaths);
    const allSelected = paths.every(p => selectedSet.has(p));

    if (allSelected) {
      dispatch(removeCellPaths(paths));
    } else {
      dispatch(addCellPaths(paths));
    }
  };

  const pronounTypeForTable =
    filters.pronounType !== 'all' && filters.pronounType.length === 1 ? filters.pronounType[0] : 'all';
  const pronounPersonForTable =
    filters.pronounPerson !== 'all' && filters.pronounPerson.length === 1 ? filters.pronounPerson[0] : 'all';

  const handleSelectAll = () => {
    const allPaths = formSelection.getAllPaths(filters.partOfSpeech, pronounTypeForTable, pronounPersonForTable);
    dispatch(addCellPaths(allPaths));
  };

  const handleClearSelection = () => {
    dispatch(clearSelection());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
      <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <AdminIconChip icon={Filter} />
          <div>
            <h1 className="text-xl font-serif tracking-wide">Advanced Filters</h1>
            <p className="text-sm text-roman-stone">Query vocabulary with advanced criteria</p>
          </div>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(18rem,45%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[35%_65%] lg:grid-rows-none">
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain border-b border-gray-200 bg-roman-marble p-4 lg:border-b-0 lg:border-r">
          <AdvancedFiltersPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={handleReset}
            onApply={handleApply}
            isLoading={isFetching}
          />

          {filters.partOfSpeech !== 'all' && (
            <FormSelectionTable
              partOfSpeech={filters.partOfSpeech}
              pronounType={pronounTypeForTable}
              pronounPerson={pronounPersonForTable}
              selectedCellPaths={selection.selectedCellPaths}
              onToggleCell={handleToggleCell}
              onSelectAll={handleSelectAll}
              onClearSelection={handleClearSelection}
              onTogglePaths={handleTogglePaths}
            />
          )}
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain bg-white p-4 sm:p-6">
          {isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 mb-6">
              Failed to load words. Please try again.
            </div>
          )}

          <AdvancedResultsList
            words={words}
            isLoading={isLoading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            selectedTableType={selection.selectedTableType}
            selectedCellPaths={selection.selectedCellPaths}
            totalCount={totalCount}
          />
        </div>
      </main>
    </div>
  );
}

export default withAdminAuth(AdvancedFiltersPage);
