import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import authReducer from './slices/authSlice';
import lessonEditorReducer from './slices/lessonEditorSlice';
import clipboardReducer from './slices/clipboardSlice';
import vocabularyPoolsReducer from './slices/vocabularyPoolSlice';
import vocabularyReducer from './slices/vocabularySlice';
import { appApi } from './api/appApi';
import { generatedExerciseApi } from './api/generatedExerciseApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lessonEditor: lessonEditorReducer,
    clipboard: clipboardReducer,
    vocabularyPools: vocabularyPoolsReducer,
    vocabulary: vocabularyReducer,
    [appApi.reducerPath]: appApi.reducer,
    [generatedExerciseApi.reducerPath]: generatedExerciseApi.reducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(appApi.middleware, generatedExerciseApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
