'use client';

import React, { useState, useEffect, useEffectEvent } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Button } from '@/src/components/ui/button';
import { BookOpen, Download } from 'lucide-react';
import { toast } from 'sonner';
import { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import {
  useGetWordTypeCountsQuery,
  useUpdateWordMutation,
  useCreateWordMutation,
  useDeleteWordMutation,
  type DeleteWordResponse,
} from '@/src/store/api/vocabularyApi';
import {
  updateFilters as updateFiltersAction,
  resetFilters as resetFiltersAction,
  selectVocabularyFilters,
} from '@/src/store/slices/vocabularySlice';
import { useCurrentWordsQuery } from '@/src/hooks/useCurrentWordsQuery';
import { useDebounce } from '@/src/hooks/useDebounce';
import { WordEditPanel, type SaveAndNext } from '@/src/components/ui/admin/vocabulary/WordEditPanel';
import { AIAssistantProvider } from '@/src/components/ui/admin/vocabulary/aiAssistantStore';
import { VocabularyAIRulesDialog } from '@/src/components/ui/admin/vocabulary/VocabularyAIRulesDialog';
import { useLearnedAIRules } from '@/src/store/api/vocabularyAIGuidanceApi';
import { VocabularyFiltersComponent } from '@/src/components/ui/admin/vocabulary/VocabularyFilters';
import { VocabularyList } from '@/src/components/ui/admin/vocabulary/VocabularyList';
import { withAdminAuth } from '@/src/components/auth/withAdminAuth';
import { AdminIconChip } from '@/src/components/admin/shell';
import { ConfirmationDialog } from '@/src/components/ui/core/ConfirmationDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/src/components/ui/select';
import { PartOfSpeechSchema, type PartOfSpeech } from '@/shared/types/vocabulary/schemas/enums';
import { buildEmptyWord, isPlaceholderWord } from '@/src/utils/vocabulary-defaults';
import { fetchVocabularyBackup } from '@/src/services/vocabularyBackupService';
import { VocabularyWordWithIdSchema } from '@/shared/types/vocabulary/schemas';
import { useExistingHeadword } from '@/src/components/ui/admin/vocabulary/ExistingHeadword';

const EMPTY_WORDS: VocabularyWordWithId[] = [];
const PART_OF_SPEECH_OPTIONS = PartOfSpeechSchema.options;

/** The word the URL names (`#word-<id>`), so a reload or a shared link reopens it. */
function wordIdFromHash(): string | null {
  if (typeof window === 'undefined') return null;
  const { hash } = window.location;
  return hash.startsWith('#word-') ? hash.substring(6) || null : null;
}

type NewWord = Omit<VocabularyWord, 'createdAt' | 'updatedAt'>;

/** The words a create was refused for, when the headword is already in the vocabulary. */
function existingWordsOf(error: unknown): VocabularyWordWithId[] | null {
  const { status, data } = (error ?? {}) as { status?: unknown; data?: { code?: unknown; existingWords?: unknown } };
  if (status !== 409 || data?.code !== 'WORD_ALREADY_EXISTS' || !Array.isArray(data.existingWords)) return null;
  return data.existingWords.flatMap(word => {
    const parsed = VocabularyWordWithIdSchema.safeParse(word);
    return parsed.success ? [parsed.data as VocabularyWordWithId] : [];
  });
}

function omitUndefinedFields<T extends object>(updates: T): Partial<T> {
  return Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function AdminVocabularyPage() {
  const dispatch = useDispatch();
  const learnedRules = useLearnedAIRules();
  const filters = useSelector(selectVocabularyFilters);
  const debouncedSearch = useDebounce(filters.search, 150);

  const [lastWordId, setLastWordId] = useState<string | null>(null);
  // Read on the first render: reading it in an effect left one render with nothing selected, and the
  // effect below then cleared the URL, so every second reload lost the word.
  const [selectedWordId, setSelectedWordId] = useState<string | null>(wordIdFromHash);
  const [creatingWord, setCreatingWord] = useState<VocabularyWordWithId | null>(null);
  const [deletingWordId, setDeletingWordId] = useState<string | null>(null);
  // Unsaved edits in the editor, including what autocomplete filled or the AI's accepted answers.
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<(() => void) | null>(null);
  const [poolWarning, setPoolWarning] = useState<{
    word: VocabularyWordWithId;
    pools: { id: string; name: string }[];
    confirmationToken: string;
  } | null>(null);
  /** A new word whose headword is already in the vocabulary, waiting for the admin to confirm it. */
  const [duplicate, setDuplicate] = useState<{ wordData: NewWord; existing: VocabularyWordWithId[] } | null>(null);
  // A new word's headword, checked against the vocabulary as it is typed, before any AI run.
  const [newHeadword, setNewHeadword] = useState('');
  const existingHeadword = useExistingHeadword(newHeadword, isPlaceholderWord(creatingWord));
  const searchPending = filters.search !== debouncedSearch;
  const queryArgs = {
    wordType: filters.wordType,
    coreType: filters.coreType,
    search: debouncedSearch,
    lastWordId: searchPending ? null : lastWordId,
  };

  const { data, isLoading, isFetching, isError, refetch } = useCurrentWordsQuery(queryArgs);
  const { data: wordTypeCounts = {}, isLoading: countsLoading } = useGetWordTypeCountsQuery();
  const [updateWord, { isLoading: updating }] = useUpdateWordMutation();
  const [createWord, { isLoading: creating }] = useCreateWordMutation();
  const [deleteWord] = useDeleteWordMutation();
  const words = data?.words ?? EMPTY_WORDS;

  useEffect(() => {
    setLastWordId(null);
  }, [filters.wordType, filters.coreType, debouncedSearch]);

  // The URL follows the selection, and is written only when it differs: every history write makes the
  // App Router update the page.
  useEffect(() => {
    if (selectedWordId) {
      if (wordIdFromHash() !== selectedWordId) window.location.hash = `word-${selectedWordId}`;
    } else if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [selectedWordId]);

  // Back, Forward or an edited URL changes the word too, so it asks first like any other switch. Until the
  // admin decides, the URL shows the word being edited again, as a new entry: rewriting the current one
  // would replace the entry Back just reached, and a second Back would skip that word.
  const followHash = useEffectEvent(() => {
    const id = wordIdFromHash();
    if (id === selectedWordId) return;
    if (editorDirty) {
      const here = selectedWordId ? `#word-${selectedWordId}` : '';
      history.pushState(null, '', window.location.pathname + window.location.search + here);
    }
    switchEditor(() => setSelectedWordId(id));
  });
  useEffect(() => {
    const handleHashChange = () => followHash();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!editorDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editorDirty]);

  /** Switching words rebuilds the editor, so unsaved edits are only dropped once the admin agrees. */
  const switchEditor = (go: () => void) => {
    if (editorDirty) setPendingSwitch(() => go);
    else go();
  };

  const handleSelectWord = (word: VocabularyWordWithId) => {
    if (!creatingWord && word.id === selectedWordId) return;
    switchEditor(() => {
      setCreatingWord(null);
      setSelectedWordId(word.id);
    });
  };

  const handleStartCreate = () =>
    switchEditor(() => {
      setCreatingWord(buildEmptyWord('verb'));
      setSelectedWordId(null);
    });

  const handleUpdateWord = async (updates: Partial<VocabularyWord>) => {
    if (!selectedWordId) return false;

    try {
      const cleanedUpdates = omitUndefinedFields(updates);
      delete cleanedUpdates.createdAt;
      delete cleanedUpdates.updatedAt;
      delete cleanedUpdates.sort_key;
      delete cleanedUpdates.random_index;

      console.debug('VocabularyPage cleaned updates', cleanedUpdates);
      const saved = await updateWord({ wordId: selectedWordId, updates: cleanedUpdates }).unwrap();
      // A word kept open while a filter hides it is not refreshed by the list, so it takes the saved
      // version here: reopening it later must not start from the version before this save.
      setKeptWord(current => (current?.id === saved.id ? saved : current));
      toast.success('Word updated successfully');
      return true;
    } catch (error) {
      console.error('Update word error:', error);
      const message = error instanceof Error ? error.message : 'Error updating word';
      toast.error(message);
      return false;
    }
  };

  /** Creates the new word. A headword already in the vocabulary is refused until the admin confirms it. */
  const handleCreateWord = async (wordData: NewWord, allowDuplicate = false) => {
    try {
      const created = await createWord({ wordData, allowDuplicate }).unwrap();
      toast.success('Word created successfully');
      setCreatingWord(null);
      setSelectedWordId(created.id);
      return true;
    } catch (error) {
      const existing = existingWordsOf(error);
      if (existing) {
        setDuplicate({ wordData, existing });
        return false;
      }
      console.error('Create word error:', error);
      const message = error instanceof Error ? error.message : 'Error creating word';
      toast.error(message);
      return false;
    }
  };

  const handleOpenExisting = (word: VocabularyWordWithId) => {
    setDuplicate(null);
    switchEditor(() => {
      // A word the filters leave out of the list is still opened.
      setKeptWord(word);
      setCreatingWord(null);
      setSelectedWordId(word.id);
    });
  };

  const handleSaveWord = async (updates: Partial<VocabularyWord>) => {
    if (isPlaceholderWord(creatingWord)) {
      const cleanedUpdates = omitUndefinedFields(updates);
      const { createdAt, updatedAt, ...wordData } = cleanedUpdates as VocabularyWord & {
        createdAt?: VocabularyWord['createdAt'];
        updatedAt?: VocabularyWord['updatedAt'];
      };
      void createdAt;
      void updatedAt;
      return handleCreateWord(wordData as NewWord);
    }

    return handleUpdateWord(updates);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleLoadMore = () => {
    const nextCursor = data?.lastWordId;
    if (!nextCursor || isFetching || searchPending) return;
    setLastWordId(nextCursor);
  };

  const handleUpdateFilters = (newFilters: Partial<typeof filters>) => {
    setLastWordId(null);
    dispatch(updateFiltersAction(newFilters));
  };

  const handleResetFilters = () => {
    setLastWordId(null);
    dispatch(resetFiltersAction());
  };

  const hasMore = data?.hasMore ?? false;
  const loadingMore = isFetching && lastWordId !== null;
  // The open word stays open when a filter or search leaves it out of the list: the editor, and any unsaved
  // edits in it, belong to the word, not to the list.
  const listedWord = selectedWordId ? (words.find(w => w.id === selectedWordId) ?? null) : null;
  const [keptWord, setKeptWord] = useState<VocabularyWordWithId | null>(null);
  if (listedWord && listedWord !== keptWord) setKeptWord(listedWord);
  const selectedWord = creatingWord ?? listedWord ?? (keptWord && keptWord.id === selectedWordId ? keptWord : null);

  // "Save and next" follows the list as filtered and sorted. It opens the next word straight away: the save
  // that precedes it has just succeeded, so there is nothing for the unsaved-changes prompt to protect.
  const selectedIndex = !creatingWord && selectedWordId ? words.findIndex(w => w.id === selectedWordId) : -1;
  const nextWord = selectedIndex >= 0 ? words[selectedIndex + 1] : undefined;
  const next: SaveAndNext | undefined =
    selectedIndex < 0
      ? undefined
      : nextWord
        ? { word: nextWord.word, open: () => setSelectedWordId(nextWord.id) }
        : {
            unavailable: hasMore
              ? 'This is the last word loaded. Load more words to keep going.'
              : 'This is the last word in the list.',
          };

  const handleCreatePartOfSpeechChange = (nextPart: PartOfSpeech) =>
    switchEditor(() => {
      setCreatingWord(buildEmptyWord(nextPart));
      setSelectedWordId(null);
    });

  const handleDeleteWord = async (word: VocabularyWordWithId, confirmationToken?: string) => {
    setDeletingWordId(word.id);
    try {
      await deleteWord({ wordId: word.id, confirmationToken }).unwrap();
      toast.success(`Word "${word.word}" deleted successfully`);
      if (selectedWordId === word.id) {
        setSelectedWordId(null);
      }
    } catch (error) {
      const fetchError = error as { status?: number; data?: DeleteWordResponse };
      if (
        fetchError.status === 409 &&
        fetchError.data?.warning &&
        fetchError.data.referencedPools &&
        fetchError.data.confirmationToken
      ) {
        setPoolWarning({
          word,
          pools: fetchError.data.referencedPools,
          confirmationToken: fetchError.data.confirmationToken,
        });
        return;
      }
      console.error('Delete word error:', error);
      const message = error instanceof Error ? error.message : 'Error deleting word';
      toast.error(message);
    } finally {
      setDeletingWordId(null);
    }
  };

  const handleConfirmDeleteWithPools = async () => {
    if (!poolWarning) return;
    setPoolWarning(null);
    await handleDeleteWord(poolWarning.word, poolWarning.confirmationToken);
  };

  const handleBackup = async () => {
    try {
      const { blob, filename } = await fetchVocabularyBackup();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
      toast.success('Backup downloaded');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Vocabulary backup failed');
    }
  };

  return (
    <AIAssistantProvider>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-roman-marble">
        <header className="bg-white border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <AdminIconChip icon={BookOpen} />
            <div>
              <h1 className="text-xl font-serif tracking-wide">Vocabulary Viewer</h1>
              <p className="text-sm text-roman-stone">View and edit Latin words</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isPlaceholderWord(creatingWord) && (
              <Select
                value={creatingWord?.part_of_speech}
                onValueChange={value => handleCreatePartOfSpeechChange(value as PartOfSpeech)}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue placeholder="Part of speech" />
                </SelectTrigger>
                <SelectContent>
                  {PART_OF_SPEECH_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={handleStartCreate} disabled={creating || isPlaceholderWord(creatingWord)}>
              {creating ? 'Creating...' : 'Create Word'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleBackup}>
              <Download className="h-4 w-4 mr-2" />
              Backup
            </Button>
            <VocabularyAIRulesDialog />
          </div>
        </header>

        <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(18rem,40%)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(22rem,30%)_minmax(0,1fr)] lg:grid-rows-none">
          <div className="flex min-h-0 flex-col overflow-hidden border-b border-gray-200 bg-roman-marble lg:border-b-0 lg:border-r">
            <div className="p-4">
              <VocabularyFiltersComponent
                filters={filters}
                wordTypeCounts={wordTypeCounts}
                countsLoading={countsLoading}
                onFiltersChange={handleUpdateFilters}
                onSearch={handleSearch}
                onReset={handleResetFilters}
              />
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              <VocabularyList
                words={words}
                loading={isLoading}
                loadingMore={loadingMore}
                hasMore={hasMore}
                error={isError}
                onRetry={refetch}
                onLoadMore={handleLoadMore}
                onSelectWord={handleSelectWord}
                onDeleteWord={handleDeleteWord}
                selectedWordId={selectedWordId}
                deletingWordId={deletingWordId}
              />
            </div>
          </div>

          <div className="min-h-0 overflow-hidden">
            <WordEditPanel
              key={selectedWord?.id ?? 'no-selection'}
              word={selectedWord}
              onSave={handleSaveWord}
              updating={updating || creating}
              learnedRules={learnedRules}
              onDirtyChange={setEditorDirty}
              next={next}
              onHeadwordChange={setNewHeadword}
              existingHeadword={isPlaceholderWord(creatingWord) ? existingHeadword : undefined}
              onOpenWord={handleOpenExisting}
            />
          </div>
        </main>

        <ConfirmationDialog
          isOpen={pendingSwitch !== null}
          onClose={() => setPendingSwitch(null)}
          onConfirm={() => {
            const go = pendingSwitch;
            setPendingSwitch(null);
            go?.();
          }}
          title="Discard unsaved changes?"
          description={`Your changes to ${selectedWord?.word || 'this word'} have not been saved. Save them with Apply first, or discard them. The conversation with the AI is kept either way.`}
          confirmText="Discard changes"
          cancelText="Keep editing"
          confirmVariant="destructive"
        />

        <ConfirmationDialog
          isOpen={duplicate !== null}
          onClose={() => setDuplicate(null)}
          onConfirm={() => {
            if (duplicate) void handleCreateWord(duplicate.wordData, true);
          }}
          title="This word is already in the vocabulary"
          description={`"${duplicate?.wordData.word.trim() ?? ''}" is already in the vocabulary. Open it to edit it, or create this one anyway if it is a different word with the same spelling (like cum the preposition and cum the conjunction).`}
          confirmText="Create anyway"
          cancelText="Keep editing">
          {duplicate && duplicate.existing.length > 0 && (
            <ul aria-label="Words already in the vocabulary" className="space-y-2">
              {duplicate.existing.map(word => (
                <li key={word.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="min-w-0 truncate text-sm">
                    <span className="font-serif font-semibold">{word.word}</span>
                    <span className="text-roman-stone">
                      {' '}
                      · {word.part_of_speech} · {word.translation}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Open ${word.word} (${word.part_of_speech})`}
                    onClick={() => handleOpenExisting(word)}>
                    Open
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ConfirmationDialog>

        <ConfirmationDialog
          isOpen={!!poolWarning}
          onClose={() => setPoolWarning(null)}
          onConfirm={handleConfirmDeleteWithPools}
          title="Word Used in Vocabulary Pools"
          description={
            poolWarning
              ? `The word "${poolWarning.word.word}" is used in the following pool(s): ${poolWarning.pools.map(p => p.name).join(', ')}. Deleting it will remove it from those pools. Continue?`
              : ''
          }
          confirmText="Delete & Remove from Pools"
          cancelText="Cancel"
        />
      </div>
    </AIAssistantProvider>
  );
}

export default withAdminAuth(AdminVocabularyPage);
