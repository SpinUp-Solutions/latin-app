import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User } from 'firebase/auth';
import { z } from 'zod';

export const UserRoleSchema = z.enum(['student', 'teacher', 'admin']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const FirestoreUserDataSchema = z.object({
  uid: z.string(),
  email: z.string().email(),
  role: UserRoleSchema,
  username: z.string().optional().default(''),
  firstName: z.string().optional().default(''),
  lastName: z.string().optional().default(''),
  dateOfBirth: z.string().optional().default(''),
  createdAt: z.union([z.string(), z.any()]).optional(), // Allow timestamp or string
});
export type FirestoreUserData = z.infer<typeof FirestoreUserDataSchema>;

export interface CustomUser extends Omit<User, 'uid'> {
  uid: string;
  role: UserRole;
  username: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

interface AuthState {
  user: CustomUser | null;
  loading: boolean;
}

const initialState: AuthState = {
  user: null,
  loading: true,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<CustomUser | null>) => {
      state.user = action.payload;
      state.loading = false;
    },
  },
});

export const { setUser } = authSlice.actions;
export default authSlice.reducer;
