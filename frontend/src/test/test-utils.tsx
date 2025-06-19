import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { RenderResult } from '@testing-library/react';
import { RootState } from '../store/index';

// Import your reducers here
import authReducer from '../store/slices/authSlice';
import uiReducer from '../store/slices/uiSlice';
import { api } from '../store/api/apiSlice';

interface ExtendedRenderOptions extends Omit<RenderOptions, 'queries'> {
  preloadedState?: Partial<RootState>;
  store?: any;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: {
        auth: authReducer,
        ui: uiReducer,
        [api.reducerPath]: api.reducer,
      },
      preloadedState: preloadedState as any,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: {
            ignoredActions: ['persist/PERSIST'],
          },
        }).concat(api.middleware),
    }),
    ...renderOptions
  }: ExtendedRenderOptions = {}
): RenderResult & { store: any } {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <Provider store={store}>
        <BrowserRouter>
          {children}
        </BrowserRouter>
      </Provider>
    );
  }

  const renderResult = render(ui, { wrapper: Wrapper, ...renderOptions });
  return { ...renderResult, store };
}

// Re-export everything
export * from '@testing-library/react';
export { renderWithProviders as render };

// Custom test utilities
export const createMockUser = (overrides = {}) => ({
  id: '1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
  isActive: true,
  isEmailVerified: true,
  mfaEnabled: false,
  createdAt: new Date().toISOString(),
  roles: [{ name: 'auditor', displayName: 'Auditor' }],
  ...overrides,
});

export const createMockCase = (overrides = {}) => ({
  id: '1',
  title: 'Test Case',
  status: 'pending',
  priority: 'medium',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createMockAudit = (overrides = {}) => ({
  id: '1',
  caseId: '1',
  findings: [],
  recommendations: [],
  status: 'draft',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// API mock utilities
export const mockApiResponse = <T,>(data: T, delay = 0) => {
  return new Promise<{ data: T }>((resolve) => {
    setTimeout(() => {
      resolve({ data });
    }, delay);
  });
};

export const mockApiError = (message: string, status = 400, delay = 0) => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject({
        response: {
          status,
          data: { message },
        },
      });
    }, delay);
  });
};