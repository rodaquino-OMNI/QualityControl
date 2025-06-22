import { store } from './index';
import { setCredentials, setLoading } from './slices/authSlice';
import { authApi } from '../services/authService';

/**
 * Initialize the Redux store with persisted authentication state
 * This function should be called on app startup to hydrate auth state
 */
export const initializeStore = async () => {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');

  if (accessToken && refreshToken) {
    store.dispatch(setLoading(true));
    
    try {
      // Try to get current user to validate the token
      const result = await store.dispatch(authApi.endpoints.getCurrentUser.initiate() as any);
      
      if ('data' in result && result.data) {
        // Token is valid, set credentials in store
        store.dispatch(setCredentials({
          user: result.data as any,
          accessToken,
          refreshToken,
        }));
      } else {
        // Token is invalid, clear localStorage
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        store.dispatch(setLoading(false));
      }
    } catch (error) {
      // Error occurred, clear tokens and stop loading
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      store.dispatch(setLoading(false));
    }
  } else {
    // No tokens found, ensure loading is false
    store.dispatch(setLoading(false));
  }
};

/**
 * Clear all authentication state and localStorage
 */
export const clearAuthState = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

/**
 * Check if user is authenticated based on store state
 */
export const isAuthenticated = () => {
  const state = store.getState();
  return state.auth.isAuthenticated && state.auth.accessToken && state.auth.user;
};

/**
 * Get current user from store
 */
export const getCurrentUser = () => {
  const state = store.getState();
  return state.auth.user;
};

/**
 * Get access token from store
 */
export const getAccessToken = () => {
  const state = store.getState();
  return state.auth.accessToken;
};