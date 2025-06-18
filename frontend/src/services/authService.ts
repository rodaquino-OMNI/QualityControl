import { apiSlice } from '../store/api/apiSlice';

export interface LoginRequest {
  email: string;
  password: string;
  deviceId?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username?: string;
}

export interface MFAVerifyRequest {
  userId: string;
  token: string;
  deviceId?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

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
  roles: Role[];
}

export interface Role {
  name: string;
  displayName: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface MFAResponse {
  requiresMFA: boolean;
  userId: string;
  message: string;
}

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Login
    login: builder.mutation<AuthResponse | MFAResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
    }),

    // Register
    register: builder.mutation<{ message: string; user: User }, RegisterRequest>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
    }),

    // Verify MFA
    verifyMFA: builder.mutation<AuthResponse, MFAVerifyRequest>({
      query: (mfaData) => ({
        url: '/auth/mfa/verify',
        method: 'POST',
        body: mfaData,
      }),
    }),

    // Refresh token
    refreshToken: builder.mutation<{ accessToken: string; refreshToken: string }, RefreshTokenRequest>({
      query: (data) => ({
        url: '/auth/refresh',
        method: 'POST',
        body: data,
      }),
    }),

    // Get current user
    getCurrentUser: builder.query<User, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
    }),

    // Logout
    logout: builder.mutation<{ message: string }, { refreshToken?: string }>({
      query: (data) => ({
        url: '/auth/logout',
        method: 'POST',
        body: data,
      }),
    }),

    // Enable MFA
    enableMFA: builder.mutation<{ secret: string; qrCode: string; message: string }, void>({
      query: () => ({
        url: '/auth/mfa/enable',
        method: 'POST',
      }),
      invalidatesTags: ['User'],
    }),

    // Disable MFA
    disableMFA: builder.mutation<{ message: string }, { token: string }>({
      query: (data) => ({
        url: '/auth/mfa/disable',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['User'],
    }),

    // OAuth login
    initiateOAuth: builder.query<{ authUrl: string }, string>({
      query: (provider) => `/auth/oauth/${provider}`,
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterMutation,
  useVerifyMFAMutation,
  useRefreshTokenMutation,
  useGetCurrentUserQuery,
  useLogoutMutation,
  useEnableMFAMutation,
  useDisableMFAMutation,
  useLazyInitiateOAuthQuery,
} = authApi;