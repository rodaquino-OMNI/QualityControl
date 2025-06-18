import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { 
  useLoginMutation, 
  useLogoutMutation, 
  useGetCurrentUserQuery,
  useVerifyMFAMutation,
  useEnableMFAMutation,
  useDisableMFAMutation,
} from '../services/authService';
import { logout as logoutAction } from '../store/slices/authSlice';

export const useAuth = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const auth = useAppSelector((state) => state.auth);
  
  const [login] = useLoginMutation();
  const [logoutMutation] = useLogoutMutation();
  const [verifyMFA] = useVerifyMFAMutation();
  const [enableMFA] = useEnableMFAMutation();
  const [disableMFA] = useDisableMFAMutation();
  
  const { refetch: refetchUser } = useGetCurrentUserQuery(undefined, {
    skip: !auth.accessToken,
  });

  const handleLogin = useCallback(async (email: string, password: string) => {
    try {
      const result = await login({ email, password }).unwrap();
      
      if ('accessToken' in result) {
        // Login successful
        navigate('/dashboard');
        return { success: true };
      } else if ('requiresMFA' in result) {
        // MFA required
        return { success: true, requiresMFA: true, userId: result.userId };
      }
    } catch (error: any) {
      return { 
        success: false, 
        error: error.data?.message || 'Login failed' 
      };
    }
  }, [login, navigate]);

  const handleMFAVerify = useCallback(async (userId: string, token: string) => {
    try {
      await verifyMFA({ userId, token }).unwrap();
      navigate('/dashboard');
      return { success: true };
    } catch (error: any) {
      return { 
        success: false, 
        error: error.data?.message || 'Invalid MFA token' 
      };
    }
  }, [verifyMFA, navigate]);

  const handleLogout = useCallback(async () => {
    try {
      if (auth.refreshToken) {
        await logoutMutation({ refreshToken: auth.refreshToken }).unwrap();
      }
    } catch (error) {
      // Even if the API call fails, we should still log out locally
      console.error('Logout API call failed:', error);
    }
    
    dispatch(logoutAction());
    navigate('/login');
  }, [auth.refreshToken, logoutMutation, dispatch, navigate]);

  const hasRole = useCallback((roleName: string): boolean => {
    return auth.user?.roles.some(role => role.name === roleName) || false;
  }, [auth.user]);

  const hasAnyRole = useCallback((roleNames: string[]): boolean => {
    return auth.user?.roles.some(role => roleNames.includes(role.name)) || false;
  }, [auth.user]);

  const hasPermission = useCallback((resource: string, action: string): boolean => {
    // For now, admins have all permissions
    if (hasRole('admin')) return true;
    
    // TODO: Implement actual permission checking based on your backend
    // This would require fetching user permissions from the API
    return false;
  }, [hasRole]);

  const getUserDisplayName = useCallback((): string => {
    if (!auth.user) return '';
    return `${auth.user.firstName} ${auth.user.lastName}`;
  }, [auth.user]);

  const getInitials = useCallback((): string => {
    if (!auth.user) return '';
    return `${auth.user.firstName[0]}${auth.user.lastName[0]}`.toUpperCase();
  }, [auth.user]);

  return {
    // State
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    mfaPending: auth.mfaPending,
    mfaUserId: auth.mfaUserId,
    
    // Actions
    login: handleLogin,
    logout: handleLogout,
    verifyMFA: handleMFAVerify,
    enableMFA,
    disableMFA,
    refetchUser,
    
    // Helpers
    hasRole,
    hasAnyRole,
    hasPermission,
    getUserDisplayName,
    getInitials,
  };
};