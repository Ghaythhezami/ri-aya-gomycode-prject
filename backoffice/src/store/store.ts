import { configureStore } from '@reduxjs/toolkit';
import { authReducer, setUser } from './authSlice';
import { apiSlice } from './api';
import { clinicApi } from './clinicApi';
import { setupListeners } from '@reduxjs/toolkit/query';
import i18n from '../i18n';
import { api } from '../lib/api';
import { installLanguageSync } from './languageSync';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [apiSlice.reducerPath]: apiSlice.reducer,
    [clinicApi.reducerPath]: clinicApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(apiSlice.middleware, clinicApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Names, types and roles are stored in three languages and resolved by the API from
// Accept-Language, so a language switch refetches everything and saves the preference.
installLanguageSync({
  i18n,
  resetCache: () => {
    store.dispatch(clinicApi.util.resetApiState());
  },
  refreshUser: () => {
    store
      .dispatch(apiSlice.endpoints.me.initiate(undefined, { forceRefetch: true }))
      .unwrap()
      .then((user) => store.dispatch(setUser(user)))
      .catch(() => undefined);
  },
  isSignedIn: () => Boolean(store.getState().auth.accessToken),
  storedLocale: () => store.getState().auth.user?.preferredLocale,
  persist: (preferredLocale) => api.patch('/api/profile', { preferredLocale }),
});
