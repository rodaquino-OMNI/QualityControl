import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, 
  FileText, 
  BarChart3, 
  Settings, 
  Bell,
  Plus,
  Search,
  Menu,
  X,
  AlertTriangle,
  Shield,
  Clock,
  User
} from 'lucide-react';
import { useAppSelector } from '../../store/hooks';

interface MobileNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  badge?: number;
  urgent?: boolean;
}

interface MobileNavigationProps {
  onQuickAction?: (action: string) => void;
  emergencyMode?: boolean;
}

const MobileNavigation: React.FC<MobileNavigationProps> = ({ 
  onQuickAction, 
  emergencyMode = false 
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Get notification count from store
  const notifications = 0; // TODO: Add notifications state to store
  const user = useAppSelector(state => state.auth.user);

  useEffect(() => {
    setNotificationCount(notifications);
  }, [notifications]);

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

  const primaryNavItems: MobileNavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: Home,
      path: '/dashboard'
    },
    {
      id: 'cases',
      label: 'Cases',
      icon: FileText,
      path: '/cases',
      badge: 5 // Dynamic from store
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
      path: '/analytics'
    },
    {
      id: 'notifications',
      label: 'Alerts',
      icon: Bell,
      path: '/notifications',
      badge: notificationCount,
      urgent: notificationCount > 0
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      path: '/settings'
    }
  ];

  const emergencyNavItems: MobileNavItem[] = [
    {
      id: 'emergency',
      label: 'Emergency',
      icon: AlertTriangle,
      path: '/emergency',
      urgent: true
    },
    {
      id: 'protocols',
      label: 'Protocols',
      icon: Shield,
      path: '/protocols'
    },
    {
      id: 'contacts',
      label: 'Contacts',
      icon: User,
      path: '/emergency-contacts'
    }
  ];

  const quickActions = [
    { id: 'new-case', label: 'New Case', icon: Plus },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'quick-scan', label: 'Quick Scan', icon: FileText }
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  const handleQuickAction = (actionId: string) => {
    onQuickAction?.(actionId);
    setIsMenuOpen(false);
  };

  const isActiveRoute = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path);
  };

  const getNavItems = () => {
    return emergencyMode ? [...emergencyNavItems, ...primaryNavItems] : primaryNavItems;
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="mobile-header lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="mobile-menu-button"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            
            <div className="flex items-center space-x-2">
              <img 
                src="/frontend/public/icons/icon-72x72.png" 
                alt="QualityControl" 
                className="w-8 h-8 rounded"
              />
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                QualityControl
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Connection Status */}
            <div className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-green-500' : 'bg-red-500'
            }`} />
            
            {/* Emergency Mode Indicator */}
            {emergencyMode && (
              <div className="flex items-center space-x-1 px-2 py-1 bg-red-100 dark:bg-red-900 rounded-full">
                <AlertTriangle size={12} className="text-red-600 dark:text-red-400" />
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  Emergency
                </span>
              </div>
            )}

            {/* User Avatar */}
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-xs font-medium text-white">
                {user?.firstName?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
          </div>
        </div>

        {/* Offline Banner */}
        {!isOnline && (
          <div className="bg-yellow-50 dark:bg-yellow-900 border-b border-yellow-200 dark:border-yellow-700 px-4 py-2">
            <div className="flex items-center space-x-2">
              <Clock size={16} className="text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                Offline mode - Limited functionality
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Slide-out Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setIsMenuOpen(false)}
          />
          
          {/* Menu Panel */}
          <div className="absolute left-0 top-0 h-full w-80 max-w-[85vw] bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex flex-col h-full">
              {/* Menu Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Menu
                </h2>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Quick Actions */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      className="flex flex-col items-center p-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <action.icon size={20} className="text-blue-600 dark:text-blue-400 mb-1" />
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {action.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Navigation Items */}
              <div className="flex-1 overflow-y-auto">
                <nav className="p-4">
                  <div className="space-y-2">
                    {getNavItems().map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleNavigation(item.path)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                          isActiveRoute(item.path)
                            ? 'bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                        } ${item.urgent ? 'ring-2 ring-red-300 dark:ring-red-700' : ''}`}
                      >
                        <div className="flex items-center space-x-3">
                          <item.icon 
                            size={20} 
                            className={item.urgent ? 'text-red-600 dark:text-red-400' : ''} 
                          />
                          <span className="font-medium">{item.label}</span>
                        </div>
                        
                        {item.badge && item.badge > 0 && (
                          <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                            item.urgent 
                              ? 'bg-red-500 text-white' 
                              : 'bg-blue-500 text-white'
                          }`}>
                            {item.badge > 99 ? '99+' : item.badge}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </nav>
              </div>

              {/* Menu Footer */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium text-white">
                      {user?.firstName?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user ? `${user.firstName} ${user.lastName}` : 'User'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user?.roles?.[0]?.displayName || 'Healthcare Professional'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="mobile-nav md:hidden">
        <div className="flex">
          {primaryNavItems.slice(0, 4).map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigation(item.path)}
              className={`mobile-nav-item ${
                isActiveRoute(item.path) 
                  ? 'text-blue-600 dark:text-blue-400' 
                  : 'text-gray-500 dark:text-gray-400'
              } ${item.urgent ? 'animate-pulse' : ''}`}
            >
              <div className="relative">
                <item.icon className="mobile-nav-icon" />
                {item.badge && item.badge > 0 && (
                  <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs font-medium flex items-center justify-center ${
                    item.urgent 
                      ? 'bg-red-500 text-white' 
                      : 'bg-blue-500 text-white'
                  }`}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </div>
                )}
              </div>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
          
          {/* More button */}
          <button
            onClick={() => setIsMenuOpen(true)}
            className="mobile-nav-item text-gray-500 dark:text-gray-400"
          >
            <Menu className="mobile-nav-icon" />
            <span className="text-xs font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Floating Action Button for Emergency */}
      {emergencyMode && (
        <button
          onClick={() => handleNavigation('/emergency')}
          className="fixed bottom-20 right-4 w-14 h-14 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg flex items-center justify-center z-40 animate-pulse"
          aria-label="Emergency Access"
        >
          <AlertTriangle size={24} />
        </button>
      )}
    </>
  );
};

export default MobileNavigation;