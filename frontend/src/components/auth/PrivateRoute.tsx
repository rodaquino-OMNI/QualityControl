import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '../../store/hooks';
import { useGetCurrentUserQuery } from '../../services/authService';
import LoadingSpinner from '../common/LoadingSpinner';

interface PrivateRouteProps {
  requiredRoles?: string[];
  requiredPermissions?: Array<{ resource: string; action: string }>;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ requiredRoles = [], requiredPermissions = [] }) => {
  const location = useLocation();
  const { isAuthenticated, isLoading: authLoading, user, accessToken } = useAppSelector((state) => state.auth);
  
  // Try to fetch current user if we have a token but no user data
  const { isLoading: userLoading } = useGetCurrentUserQuery(undefined, {
    skip: !accessToken || !!user,
  });

  const isLoading = authLoading || userLoading;

  // Check role requirements
  const hasRequiredRole = requiredRoles.length === 0 || 
    (user && requiredRoles.some(role => user.roles.some(r => r.name === role)));

  // Check permission requirements
  const hasRequiredPermissions = requiredPermissions.length === 0 || 
    (user && requiredPermissions.every(({ resource, action }) => {
      // This would need to be implemented based on your permission structure
      // For now, admins have all permissions
      return user.roles.some(r => r.name === 'admin');
    }));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to login page but save the location they were trying to go to
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hasRequiredRole || !hasRequiredPermissions) {
    // User is authenticated but doesn't have required role/permissions
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
};

export default PrivateRoute;