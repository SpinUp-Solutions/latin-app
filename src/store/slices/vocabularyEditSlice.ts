import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { VocabularyWord, VocabularyWordWithId } from '@/src/types/vocabulary/index';
import type { TableType } from '@/src/utils/schema-helpers';

type TableData = Record<string, unknown>;

interface VocabularyEditState {
  wordId: string | null;
  partOfSpeech: VocabularyWord['part_of_speech'] | null;
  declensionTable: TableData;
  degreesTable: TableData;
  conjugationTable: TableData;
}

const emptyState: VocabularyEditState = {
  wordId: null,
  partOfSpeech: null,
  declensionTable: {},
  degreesTable: {},
  conjugationTable: {},
};

const cloneTable = (value: unknown): TableData => {
  if (value === undefined || value === null) return {};
  try {
    return JSON.parse(JSON.stringify(value)) as TableData;
  } catch {
    return {};
  }
};

const setNestedValue = (target: TableData, path: string, value: unknown) => {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) return;

  let current: Record<string, unknown> = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  const finalKey = segments[segments.length - 1];
  current[finalKey] = value;
};

export const vocabularyEditSlice = createSlice({
  name: 'vocabularyEdit',
  initialState: emptyState,
  reducers: {
    initFromWord: (state, action: PayloadAction<VocabularyWordWithId>) => {
      const word = action.payload;
      state.wordId = word.id;
      state.partOfSpeech = word.part_of_speech;
      state.declensionTable =
        word.part_of_speech === 'noun' || word.part_of_speech === 'pronoun'
          ? cloneTable((word as unknown as Record<string, unknown>).declension_table)
          : {};
      state.degreesTable =
        word.part_of_speech === 'adjective'
          ? cloneTable((word as unknown as Record<string, unknown>).degrees_table)
          : {};
      state.conjugationTable =
        word.part_of_speech === 'verb'
          ? cloneTable((word as unknown as Record<string, unknown>).conjugation_table)
          : {};
    },
    clear: () => emptyState,
    setCell: (state, action: PayloadAction<{ tableType: TableType; path: string; value: string[] | null }>) => {
      const { tableType, path, value } = action.payload;

      if (tableType === 'declension') {
        const nextTable = cloneTable(state.declensionTable);
        setNestedValue(nextTable, path, value);
        state.declensionTable = nextTable;
      } else if (tableType === 'adjective-declension') {
        const nextTable = cloneTable(state.degreesTable);
        setNestedValue(nextTable, path, value);
        state.degreesTable = nextTable;
      } else if (tableType === 'conjugation') {
        const nextTable = cloneTable(state.conjugationTable);
        setNestedValue(nextTable, path, value);
        state.conjugationTable = nextTable;
      }
    },
  },
});

export const { initFromWord, clear, setCell } = vocabularyEditSlice.actions;

export default vocabularyEditSlice.reducer;

export const selectDeclensionTable = (state: { vocabularyEdit: VocabularyEditState }) =>
  state.vocabularyEdit.declensionTable;
export const selectDegreesTable = (state: { vocabularyEdit: VocabularyEditState }) => state.vocabularyEdit.degreesTable;
export const selectConjugationTable = (state: { vocabularyEdit: VocabularyEditState }) =>
  state.vocabularyEdit.conjugationTable;
export const selectVocabularyPartOfSpeech = (state: { vocabularyEdit: VocabularyEditState }) =>
  state.vocabularyEdit.partOfSpeech;
export const selectVocabularyEditWordId = (state: { vocabularyEdit: VocabularyEditState }) =>
  state.vocabularyEdit.wordId;
