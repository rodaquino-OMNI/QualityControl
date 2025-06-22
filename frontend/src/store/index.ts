import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import { api } from './api/apiSlice';
import { rtkQueryErrorLogger } from './errorHandler';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ui: uiReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware: any) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          'persist/PERSIST',
          'persist/REHYDRATE',
          // Ignore RTK Query actions that may contain non-serializable values
          'api/executeQuery/pending',
          'api/executeQuery/fulfilled',
          'api/executeQuery/rejected',
          'api/executeMutation/pending',
          'api/executeMutation/fulfilled',
          'api/executeMutation/rejected',
        ],
        ignoredActionsPaths: ['meta.arg', 'payload.timestamp'],
        ignoredPaths: ['items.dates', 'api.queries', 'api.mutations'],
      },
      immutableCheck: {
        ignoredPaths: ['api.queries', 'api.mutations'],
      },
    }).concat(api.middleware, rtkQueryErrorLogger),
  devTools: process.env.NODE_ENV !== 'production' ? {
    name: 'AUSTA Cockpit',
    trace: true,
    traceLimit: 25,
    actionSanitizer: (action: any) => ({
      ...action,
      // Sanitize sensitive data in actions
      payload: action.type.includes('auth') && action.payload?.password
        ? { ...action.payload, password: '[REDACTED]' }
        : action.payload,
    }),
    stateSanitizer: (state: any) => ({
      ...state,
      // Sanitize sensitive data in state
      auth: state.auth ? {
        ...state.auth,
        accessToken: state.auth.accessToken ? '[REDACTED]' : null,
        refreshToken: state.auth.refreshToken ? '[REDACTED]' : null,
      } : state.auth,
    }),
  } : false,
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;