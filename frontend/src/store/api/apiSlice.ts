import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { RootState } from '../index';
import { setCredentials, logout } from '../slices/authSlice';
// Define AuthTokens locally until shared types are fixed
interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}

const baseQuery = fetchBaseQuery({
  baseUrl: (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    // Try to get a new token
    const refreshToken = (api.getState() as RootState).auth.refreshToken;
    
    if (refreshToken) {
      const refreshResult = await baseQuery(
        {
          url: '/auth/refresh',
          method: 'POST',
          body: { refreshToken },
        },
        api,
        extraOptions
      );

      if (refreshResult.data) {
        const { accessToken, refreshToken: newRefreshToken } = refreshResult.data as AuthTokens;
        const user = (api.getState() as RootState).auth.user;
        
        // Store the new tokens
        api.dispatch(
          setCredentials({
            user: user!,
            accessToken,
            refreshToken: newRefreshToken || '',
          })
        );

        // Retry the original query with new token
        result = await baseQuery(args, api, extraOptions);
      } else {
        // Refresh failed, logout
        api.dispatch(logout());
      }
    } else {
      // No refresh token, logout
      api.dispatch(logout());
    }
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Case', 'User', 'Dashboard', 'Notification', 'Analytics'],
  endpoints: () => ({}),
});

// Export the API slice
export const api = apiSlice;

// Export hooks for usage in functional components
export const {} = apiSlice;