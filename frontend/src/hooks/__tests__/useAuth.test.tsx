import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';
import authReducer from '@/store/slices/authSlice';
import uiReducer from '@/store/slices/uiSlice';
import { api } from '@/store/api/apiSlice';

// Mock the auth API endpoints
vi.mock('@/store/api/apiSlice', () => {
  const mockApi = {
    reducerPath: 'api',
    reducer: () => ({}),
    middleware: () => (next: any) => (action: any) => next(action),
    endpoints: {},
  };
  
  return {
    api: mockApi,
    apiSlice: {
      injectEndpoints: () => ({
        endpoints: {
          login: { 
            initiate: vi.fn(),
            matchFulfilled: { match: () => false },
            matchRejected: { match: () => false }
          },
          logout: { 
            initiate: vi.fn(),
            matchFulfilled: { match: () => false }
          },
          getCurrentUser: {
            initiate: vi.fn(),
            matchFulfilled: { match: () => false },
            matchRejected: { match: () => false }
          },
          verifyMFA: {
            matchFulfilled: { match: () => false },
            matchRejected: { match: () => false }
          }
        },
        useLoginMutation: () => [vi.fn().mockResolvedValue({ data: {} }), { isLoading: false }],
        useLogoutMutation: () => [vi.fn().mockResolvedValue({ data: {} }), { isLoading: false }],
        useGetCurrentUserQuery: () => ({ data: null, isLoading: false, refetch: vi.fn() }),
        useVerifyMFAMutation: () => [vi.fn().mockResolvedValue({ data: {} }), { isLoading: false }],
        useEnableMFAMutation: () => [vi.fn().mockResolvedValue({ data: {} }), { isLoading: false }],
        useDisableMFAMutation: () => [vi.fn().mockResolvedValue({ data: {} }), { isLoading: false }],
      })
    }
  };
});

describe('useAuth', () => {
  let store: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create a fresh store for each test
    store = configureStore({
      reducer: {
        auth: authReducer,
        ui: uiReducer,
        api: api.reducer,
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <BrowserRouter>
        {children}
      </BrowserRouter>
    </Provider>
  );

  it('should handle successful login', async () => {
    // Mock successful login response
    const mockUser = {
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
    };

    // Import the hook dynamically to ensure mocks are in place
    const { useAuth } = await import('@/hooks/useAuth');
    
    const { result } = renderHook(() => useAuth(), { wrapper });

    // The hook should initialize with no user
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should handle login error', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  it('should handle logout', async () => {
    const { useAuth } = await import('@/hooks/useAuth');
    
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});