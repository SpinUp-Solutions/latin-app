import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import lessonReducer from './slices/lessonSlice';
import lessonEditorReducer from './slices/lessonEditorSlice';
import clipboardReducer from './slices/clipboardSlice';
import vocabularyPoolsReducer from './slices/vocabularyPoolSlice';
import vocabularyReducer from './slices/vocabularySlice';
import vocabularyEditReducer from './slices/vocabularyEditSlice';
import advancedFiltersReducer from './slices/advancedFiltersSlice';
import { lessonApi } from './api/lessonApi';
import { vocabularyPoolApi } from './api/vocabularyPoolApi';
import { vocabularyApi } from './api/vocabularyApi';
import { advancedVocabularyApi } from './api/advancedVocabularyApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lesson: lessonReducer,
    lessonEditor: lessonEditorReducer,
    clipboard: clipboardReducer,
    vocabularyPools: vocabularyPoolsReducer,
    vocabulary: vocabularyReducer,
    vocabularyEdit: vocabularyEditReducer,
    advancedFilters: advancedFiltersReducer,
    [lessonApi.reducerPath]: lessonApi.reducer,
    [vocabularyPoolApi.reducerPath]: vocabularyPoolApi.reducer,
    [vocabularyApi.reducerPath]: vocabularyApi.reducer,
    [advancedVocabularyApi.reducerPath]: advancedVocabularyApi.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(
      lessonApi.middleware,
      vocabularyPoolApi.middleware,
      vocabularyApi.middleware,
      advancedVocabularyApi.middleware
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
