import React, { useState, useEffect } from 'react';
import { ClockIcon } from '@/components/common/Icons';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { logger } from '../../utils/logger';

interface Activity {
  id: string;
  type: 'case_created' | 'case_updated' | 'case_resolved' | 'comment_added';
  description: string;
  timestamp: string;
  user: string;
}

interface RecentActivityProps {
  activities: Activity[];
  onError?: (error: Error) => void;
}

const RecentActivityComponent: React.FC<RecentActivityProps> = ({ activities, onError }) => {
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<Error | null>(null);

  // Error recovery mechanism
  const handleError = (error: Error, context?: string) => {
    setLastError(error);
    setLoadingState('error');
    
    logger.error('RecentActivity component error', {
      error: error.message,
      context,
      retryCount,
      timestamp: new Date().toISOString(),
    });

    if (onError) {
      onError(error);
    }
  };

  // Retry mechanism
  const handleRetry = () => {
    if (retryCount < 3) {
      setRetryCount(prev => prev + 1);
      setLoadingState('loading');
      setLastError(null);
      
      logger.info('Retrying RecentActivity component', {
        retryCount: retryCount + 1,
      });
      
      // Trigger re-render which should reload data
      setTimeout(() => {
        setLoadingState('success');
      }, 1000);
    }
  };

  // Validate props and handle edge cases
  useEffect(() => {
    try {
      if (!Array.isArray(activities)) {
        throw new Error('Activities prop must be an array');
      }

      // Validate each activity object
      activities.forEach((activity, index) => {
        if (!activity || typeof activity !== 'object') {
          throw new Error(`Invalid activity at index ${index}: must be an object`);
        }
        if (!activity.id || typeof activity.id !== 'string') {
          throw new Error(`Invalid activity at index ${index}: missing or invalid id`);
        }
        if (!activity.description || typeof activity.description !== 'string') {
          throw new Error(`Invalid activity at index ${index}: missing or invalid description`);
        }
      });

      setLoadingState('success');
    } catch (error: any) {
      handleError(error, 'prop_validation');
    }
  }, [activities]);

  // Error state UI
  if (loadingState === 'error') {
    return (
      <div className="card border-red-200 dark:border-red-800">
        <div className="text-center py-8">
          <div className="text-red-500 dark:text-red-400 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Unable to load recent activity
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {lastError?.message || 'An unexpected error occurred'}
          </p>
          {retryCount < 3 && (
            <button
              onClick={handleRetry}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
            >
              Try Again ({3 - retryCount} attempts left)
            </button>
          )}
          {retryCount >= 3 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Maximum retry attempts reached. Please refresh the page.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Loading state UI
  if (loadingState === 'loading') {
    return (
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Activity
        </h3>
        <div className="space-y-4">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="animate-pulse flex items-start space-x-3 pb-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Safe rendering with error boundaries for individual items
  const getActivityColor = (type: Activity['type']) => {
    try {
      switch (type) {
        case 'case_created':
          return 'text-primary-600 dark:text-primary-400';
        case 'case_updated':
          return 'text-secondary-600 dark:text-secondary-400';
        case 'case_resolved':
          return 'text-success-600 dark:text-success-400';
        case 'comment_added':
          return 'text-gray-600 dark:text-gray-400';
        default:
          logger.warn('Unknown activity type', { type });
          return 'text-gray-600 dark:text-gray-400';
      }
    } catch (error: any) {
      logger.error('Error getting activity color', { type, error: error.message });
      return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Safe activity item renderer
  const renderActivityItem = (activity: Activity, index: number) => {
    try {
      return (
        <ErrorBoundary 
          key={activity.id || `activity-${index}`}
          fallback={
            <div className="flex items-center space-x-3 py-2 text-gray-500 dark:text-gray-400">
              <div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
              <span className="text-sm">Unable to display this activity</span>
            </div>
          }
        >
          <div className="flex items-start space-x-3 pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
            <div className="flex-shrink-0">
              <div className={`p-2 rounded-full bg-gray-100 dark:bg-gray-700 ${getActivityColor(activity.type)}`}>
                <ClockIcon className="w-4 h-4" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 dark:text-white">
                {activity.description || 'No description available'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {activity.user || 'Unknown user'} • {activity.timestamp || 'Unknown time'}
              </p>
            </div>
          </div>
        </ErrorBoundary>
      );
    } catch (error: any) {
      logger.error('Error rendering activity item', {
        activityId: activity.id,
        index,
        error: error.message,
      });
      
      return (
        <div key={`error-${index}`} className="flex items-center space-x-3 py-2 text-red-500 dark:text-red-400">
          <div className="w-4 h-4 bg-red-300 dark:bg-red-600 rounded-full"></div>
          <span className="text-sm">Error displaying activity</span>
        </div>
      );
    }
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Recent Activity
      </h3>
      <div className="space-y-4">
        {activities.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-8">
            No recent activity
          </p>
        ) : (
          activities.map((activity, index) => renderActivityItem(activity, index))
        )}
      </div>
    </div>
  );
};

// Export with error boundary wrapper
const RecentActivity: React.FC<RecentActivityProps> = (props) => (
  <ErrorBoundary
    onError={(error, errorInfo) => {
      logger.error('RecentActivity wrapper error boundary triggered', {
        error: error.message,
        componentStack: errorInfo.componentStack,
      });
    }}
  >
    <RecentActivityComponent {...props} />
  </ErrorBoundary>
);

export default RecentActivity;