import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import lessonReducer from './slices/lessonSlice';
import lessonEditorReducer from './slices/lessonEditorSlice';
import clipboardReducer from './slices/clipboardSlice';
import vocabularyPoolsReducer from './slices/vocabularyPoolSlice';
import vocabularyReducer from './slices/vocabularySlice';
import vocabularyEditReducer from './slices/vocabularyEditSlice';
import { lessonApi } from './api/lessonApi';
import { vocabularyPoolApi } from './api/vocabularyPoolApi';
import { vocabularyApi } from './api/vocabularyApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lesson: lessonReducer,
    lessonEditor: lessonEditorReducer,
    clipboard: clipboardReducer,
    vocabularyPools: vocabularyPoolsReducer,
    vocabulary: vocabularyReducer,
    vocabularyEdit: vocabularyEditReducer,
    [lessonApi.reducerPath]: lessonApi.reducer,
    [vocabularyPoolApi.reducerPath]: vocabularyPoolApi.reducer,
    [vocabularyApi.reducerPath]: vocabularyApi.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(lessonApi.middleware, vocabularyPoolApi.middleware, vocabularyApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
