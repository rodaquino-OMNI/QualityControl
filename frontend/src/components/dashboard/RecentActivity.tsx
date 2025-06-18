import React from 'react';
import { ClockIcon } from '../common/Icons';

interface Activity {
  id: string;
  type: 'case_created' | 'case_updated' | 'case_resolved' | 'comment_added';
  description: string;
  timestamp: string;
  user: string;
}

interface RecentActivityProps {
  activities: Activity[];
}

const RecentActivity: React.FC<RecentActivityProps> = ({ activities }) => {
  const getActivityColor = (type: Activity['type']) => {
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
        return 'text-gray-600 dark:text-gray-400';
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
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start space-x-3 pb-4 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0"
            >
              <div className="flex-shrink-0">
                <div className={`p-2 rounded-full bg-gray-100 dark:bg-gray-700 ${getActivityColor(activity.type)}`}>
                  <ClockIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 dark:text-white">
                  {activity.description}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {activity.user} • {activity.timestamp}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RecentActivity;