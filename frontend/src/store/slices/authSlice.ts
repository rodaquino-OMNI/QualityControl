import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { authApi } from '../../services/authService';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  avatar?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  roles: Array<{
    name: string;
    displayName: string;
  }>;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mfaPending: boolean;
  mfaUserId: string | null;
}

const initialState: AuthState = {
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  isAuthenticated: false,
  isLoading: true,
  error: null,
  mfaPending: false,
  mfaUserId: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: User; accessToken: string; refreshToken: string }>) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
      state.mfaPending = false;
      state.mfaUserId = null;
      localStorage.setItem('accessToken', action.payload.accessToken);
      localStorage.setItem('refreshToken', action.payload.refreshToken);
    },
    setMFAPending: (state, action: PayloadAction<{ userId: string }>) => {
      state.mfaPending = true;
      state.mfaUserId = action.payload.userId;
      state.isLoading = false;
    },
    logout: (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
      state.mfaPending = false;
      state.mfaUserId = null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    },
    updateUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Handle login
    builder
      .addMatcher(authApi.endpoints.login.matchFulfilled, (state, action) => {
        if ('accessToken' in action.payload) {
          // Successful login
          state.user = action.payload.user;
          state.accessToken = action.payload.accessToken;
          state.refreshToken = action.payload.refreshToken;
          state.isAuthenticated = true;
          state.isLoading = false;
          state.error = null;
          localStorage.setItem('accessToken', action.payload.accessToken);
          localStorage.setItem('refreshToken', action.payload.refreshToken);
        } else if ('requiresMFA' in action.payload) {
          // MFA required
          state.mfaPending = true;
          state.mfaUserId = action.payload.userId;
          state.isLoading = false;
        }
      })
      .addMatcher(authApi.endpoints.login.matchRejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Login failed';
      });

    // Handle MFA verification
    builder
      .addMatcher(authApi.endpoints.verifyMFA.matchFulfilled, (state, action) => {
        state.user = action.payload.user;
        state.accessToken = action.payload.accessToken;
        state.refreshToken = action.payload.refreshToken;
        state.isAuthenticated = true;
        state.isLoading = false;
        state.error = null;
        state.mfaPending = false;
        state.mfaUserId = null;
        localStorage.setItem('accessToken', action.payload.accessToken);
        localStorage.setItem('refreshToken', action.payload.refreshToken);
      })
      .addMatcher(authApi.endpoints.verifyMFA.matchRejected, (state, action) => {
        state.error = action.error.message || 'MFA verification failed';
      });

    // Handle logout
    builder.addMatcher(authApi.endpoints.logout.matchFulfilled, (state) => {
      state.user = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
      state.mfaPending = false;
      state.mfaUserId = null;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    });

    // Handle get current user
    builder
      .addMatcher(authApi.endpoints.getCurrentUser.matchFulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.isLoading = false;
      })
      .addMatcher(authApi.endpoints.getCurrentUser.matchRejected, (state) => {
        state.isAuthenticated = false;
        state.isLoading = false;
        state.user = null;
        state.accessToken = null;
        state.refreshToken = null;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      });
  },
});

export const {
  setCredentials,
  setMFAPending,
  logout,
  updateUser,
  setError,
  clearError,
  setLoading,
} = authSlice.actions;

export default authSlice.reducer;