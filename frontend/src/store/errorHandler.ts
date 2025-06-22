import { isRejectedWithValue } from '@reduxjs/toolkit';
import type { MiddlewareAPI, Middleware } from '@reduxjs/toolkit';
import { addNotification } from './slices/uiSlice';

interface RTKQueryError {
  status?: number | string;
  data?: {
    message?: string;
    error?: string;
  };
  error?: string;
}

/**
 * Redux middleware to handle RTK Query errors globally
 */
export const rtkQueryErrorLogger: Middleware = (api: MiddlewareAPI) => (next) => (action) => {
  // RTK Query uses `createAsyncThunk` from redux-toolkit under the hood, so we're able to utilize these matchers!
  if (isRejectedWithValue(action)) {
    console.error('RTK Query Error:', action);
    
    const payload = action.payload as RTKQueryError;
    
    // Handle different types of errors
    if (payload?.status === 401) {
      // Handle unauthorized errors
      console.warn('Unauthorized access - redirecting to login');
      // The auth slice will handle logout via the baseQueryWithReauth
    } else if (payload?.status === 403) {
      // Handle forbidden errors
      api.dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        message: 'You do not have permission to perform this action',
        duration: 5000,
      }));
    } else if (payload?.status === 404) {
      // Handle not found errors
      api.dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        message: 'The requested resource was not found',
        duration: 5000,
      }));
    } else if (payload?.status === 500) {
      // Handle server errors
      api.dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        message: 'A server error occurred. Please try again later.',
        duration: 5000,
      }));
    } else if (payload?.status === 'FETCH_ERROR') {
      // Handle network errors
      api.dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        message: 'Network error. Please check your connection and try again.',
        duration: 5000,
      }));
    } else if (payload?.status === 'TIMEOUT_ERROR') {
      // Handle timeout errors
      api.dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        message: 'Request timed out. Please try again.',
        duration: 5000,
      }));
    } else {
      // Generic error handling
      const errorMessage = payload?.data?.message || 
                          payload?.error || 
                          'An unexpected error occurred';
      
      api.dispatch(addNotification({
        id: Date.now().toString(),
        type: 'error',
        message: errorMessage,
        duration: 5000,
      }));
    }
  }

  return next(action);
};

/**
 * Helper function to create error notifications
 */
export const createErrorNotification = (message: string, duration: number = 5000) => ({
  id: Date.now().toString(),
  type: 'error' as const,
  message,
  duration,
});

/**
 * Helper function to create success notifications
 */
export const createSuccessNotification = (message: string, duration: number = 3000) => ({
  id: Date.now().toString(),
  type: 'success' as const,
  message,
  duration,
});

/**
 * Helper function to create warning notifications
 */
export const createWarningNotification = (message: string, duration: number = 4000) => ({
  id: Date.now().toString(),
  type: 'warning' as const,
  message,
  duration,
});

/**
 * Helper function to create info notifications
 */
export const createInfoNotification = (message: string, duration: number = 3000) => ({
  id: Date.now().toString(),
  type: 'info' as const,
  message,
  duration,
});