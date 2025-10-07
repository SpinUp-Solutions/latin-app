import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import lessonReducer from './slices/lessonSlice';
import lessonEditorReducer from './slices/lessonEditorSlice';
import clipboardReducer from './slices/clipboardSlice';
import vocabularyPoolsReducer from './slices/vocabularyPoolSlice';
import { lessonApi } from './api/lessonApi';
import { vocabularyPoolApi } from './api/vocabularyPoolApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lesson: lessonReducer,
    lessonEditor: lessonEditorReducer,
    clipboard: clipboardReducer,
    vocabularyPools: vocabularyPoolsReducer,
    [lessonApi.reducerPath]: lessonApi.reducer,
    [vocabularyPoolApi.reducerPath]: vocabularyPoolApi.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(lessonApi.middleware, vocabularyPoolApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
