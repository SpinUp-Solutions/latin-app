import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import lessonReducer from './slices/lessonSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    lesson: lessonReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
