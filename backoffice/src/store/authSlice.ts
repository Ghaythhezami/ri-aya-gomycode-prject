import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '../lib/types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  ready: boolean;
  sessionMessage: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  ready: false,
  sessionMessage: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: AuthUser; accessToken: string }>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.sessionMessage = null;
    },
    clearAuth(state) {
      state.user = null;
      state.accessToken = null;
    },
    setReady(state, action: PayloadAction<boolean>) {
      state.ready = action.payload;
    },
    setSessionMessage(state, action: PayloadAction<string | null>) {
      state.sessionMessage = action.payload;
    },
  },
});

export const { setCredentials, clearAuth, setReady, setSessionMessage } = authSlice.actions;
export const authReducer = authSlice.reducer;
