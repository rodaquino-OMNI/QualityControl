import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Users,
  FileText,
  Activity,
  Wifi,
  WifiOff,
  RefreshCw,
  Bell,
  Calendar,
  Search,
  Filter,
  Plus,
  Eye,
  Download,
  Share,
  Settings
} from 'lucide-react';
import { useAppSelector } from '../../store/hooks';

interface MetricCard {
  id: string;
  title: string;
  value: string | number;
  change?: {
    value: number;
    trend: 'up' | 'down';
    timeframe: string;
  };
  icon: React.ComponentType<any>;
  color: string;
  urgent?: boolean;
  offline?: boolean;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  color: string;
  action: () => void;
  badge?: number;
}

interface MobileDashboardProps {
  onNavigate: (path: string) => void;
  onQuickAction: (action: string) => void;
  emergencyMode?: boolean;
}

const MobileDashboard: React.FC<MobileDashboardProps> = ({
  onNavigate,
  onQuickAction,
  emergencyMode = false
}) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('today');

  // Mock data - replace with actual store selectors
  const dashboardData = {}; // TODO: Add dashboard state to store
  const user = useAppSelector(state => state.auth.user);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const metricsCards: MetricCard[] = [
    {
      id: 'pending-cases',
      title: 'Pending Cases',
      value: 24,
      change: { value: 12, trend: 'up', timeframe: 'vs yesterday' },
      icon: Clock,
      color: 'bg-yellow-500',
      urgent: true
    },
    {
      id: 'completed-today',
      title: 'Completed Today',
      value: 18,
      change: { value: 8, trend: 'up', timeframe: 'vs yesterday' },
      icon: CheckCircle,
      color: 'bg-green-500'
    },
    {
      id: 'critical-alerts',
      title: 'Critical Alerts',
      value: 3,
      icon: AlertTriangle,
      color: 'bg-red-500',
      urgent: true
    },
    {
      id: 'team-members',
      title: 'Active Team',
      value: 12,
      change: { value: 2, trend: 'up', timeframe: 'online now' },
      icon: Users,
      color: 'bg-blue-500'
    },
    {
      id: 'quality-score',
      title: 'Quality Score',
      value: '94.2%',
      change: { value: 2.1, trend: 'up', timeframe: 'this week' },
      icon: TrendingUp,
      color: 'bg-purple-500'
    },
    {
      id: 'avg-response',
      title: 'Avg Response',
      value: '2.4h',
      change: { value: 15, trend: 'down', timeframe: 'improvement' },
      icon: Activity,
      color: 'bg-indigo-500'
    }
  ];

  const quickActions: QuickAction[] = [
    {
      id: 'new-case',
      label: 'New Case',
      icon: Plus,
      color: 'bg-blue-500',
      action: () => onQuickAction('new-case')
    },
    {
      id: 'search',
      label: 'Search',
      icon: Search,
      color: 'bg-gray-500',
      action: () => onQuickAction('search')
    },
    {
      id: 'urgent-cases',
      label: 'Urgent',
      icon: AlertTriangle,
      color: 'bg-red-500',
      action: () => onNavigate('/cases?priority=critical'),
      badge: 3
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: BarChart3,
      color: 'bg-green-500',
      action: () => onNavigate('/analytics')
    },
    {
      id: 'notifications',
      label: 'Alerts',
      icon: Bell,
      color: 'bg-yellow-500',
      action: () => onNavigate('/notifications'),
      badge: 7
    },
    {
      id: 'calendar',
      label: 'Schedule',
      icon: Calendar,
      color: 'bg-purple-500',
      action: () => onNavigate('/calendar')
    }
  ];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Simulate data refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
    setLastUpdated(new Date());
    setIsRefreshing(false);
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="mobile-dashboard p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Good {new Date().getHours() < 12 ? 'Morning' : 'Afternoon'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {user ? `${user.firstName} ${user.lastName}` : 'Healthcare Professional'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Connection Status */}
          <div className="flex items-center space-x-1">
            {isOnline ? (
              <Wifi size={16} className="text-green-600 dark:text-green-400" />
            ) : (
              <WifiOff size={16} className="text-red-600 dark:text-red-400" />
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            <RefreshCw 
              size={16} 
              className={isRefreshing ? 'animate-spin' : ''} 
            />
          </button>
        </div>
      </div>

      {/* Emergency Mode Banner */}
      {emergencyMode && (
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="text-red-600 dark:text-red-400" size={20} />
            <div>
              <h3 className="font-semibold text-red-800 dark:text-red-200">
                Emergency Mode Active
              </h3>
              <p className="text-sm text-red-600 dark:text-red-400">
                Priority protocols are in effect. Critical cases highlighted.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <WifiOff className="text-yellow-600 dark:text-yellow-400" size={20} />
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                Working Offline
              </h3>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Data will sync when connection is restored. Last updated {formatTimeAgo(lastUpdated)}.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={action.action}
              className="relative flex flex-col items-center p-4 bg-white dark:bg-gray-800 rounded-lg shadow-soft hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700"
            >
              <div className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center mb-2`}>
                <action.icon size={20} className="text-white" />
              </div>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {action.label}
              </span>
              
              {action.badge && action.badge > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-medium rounded-full flex items-center justify-center">
                  {action.badge > 9 ? '9+' : action.badge}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Overview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Today's Overview
          </h2>
          <select
            value={selectedTimeframe}
            onChange={(e) => setSelectedTimeframe(e.target.value)}
            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {metricsCards.map((metric) => (
            <div
              key={metric.id}
              className={`bg-white dark:bg-gray-800 rounded-lg p-4 border ${
                metric.urgent 
                  ? 'border-red-200 dark:border-red-700 shadow-red-100 dark:shadow-red-900' 
                  : 'border-gray-200 dark:border-gray-700'
              } shadow-soft relative`}
            >
              {metric.offline && (
                <div className="absolute top-2 right-2 w-2 h-2 bg-yellow-500 rounded-full" />
              )}

              <div className="flex items-start justify-between mb-2">
                <div className={`w-8 h-8 ${metric.color} rounded-lg flex items-center justify-center`}>
                  <metric.icon size={16} className="text-white" />
                </div>
                {metric.urgent && (
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>

              <div className="mb-1">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {metric.title}
                </h3>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {metric.value}
                </p>
              </div>

              {metric.change && (
                <div className="flex items-center space-x-1">
                  {metric.change.trend === 'up' ? (
                    <TrendingUp size={12} className="text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown size={12} className="text-red-600 dark:text-red-400" />
                  )}
                  <span className={`text-xs font-medium ${
                    metric.change.trend === 'up' 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {metric.change.value}% {metric.change.timeframe}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity Preview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Activity
          </h2>
          <button
            onClick={() => onNavigate('/activity')}
            className="text-sm text-blue-600 dark:text-blue-400 font-medium"
          >
            View All
          </button>
        </div>

        <div className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="flex items-center space-x-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <FileText size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  Case #{1000 + item} reviewed and approved
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {item * 15} minutes ago • Dr. Smith
                </p>
              </div>
              <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <Eye size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Padding for Navigation */}
      <div className="h-20" />
    </div>
  );
};

export default MobileDashboard;