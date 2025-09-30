import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import lessonReducer from './slices/lessonSlice';
import lessonEditorReducer from './slices/lessonEditorSlice';
import clipboardReducer from './slices/clipboardSlice';
import vocabularyPoolsReducer from './slices/vocabularyPoolSlice';
import { progressApi } from './api/progressApi';
import { lessonApi } from './api/lessonApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lesson: lessonReducer,
    lessonEditor: lessonEditorReducer,
    clipboard: clipboardReducer,
    vocabularyPools: vocabularyPoolsReducer,
    [progressApi.reducerPath]: progressApi.reducer,
    [lessonApi.reducerPath]: lessonApi.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(progressApi.middleware, lessonApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
