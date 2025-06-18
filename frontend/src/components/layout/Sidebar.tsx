import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAppSelector } from '@/store/hooks';
import {
  DashboardIcon,
  CasesIcon,
  SettingsIcon,
  ReportsIcon,
  TeamIcon,
  HelpIcon,
} from '../common/Icons';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { path: '/cases', label: 'Cases', icon: CasesIcon },
  { path: '/reports', label: 'Reports', icon: ReportsIcon },
  { path: '/team', label: 'Team', icon: TeamIcon },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

const Sidebar: React.FC = () => {
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);

  return (
    <aside
      className={`fixed left-0 top-16 h-[calc(100vh-64px)] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ${
        sidebarOpen ? 'w-64' : 'w-16'
      }`}
    >
      <nav className="flex flex-col h-full">
        <div className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border-r-3 border-primary-600'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`
              }
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && (
                <span className="ml-3 transition-opacity duration-200">
                  {item.label}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <NavLink
            to="/help"
            className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <HelpIcon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="ml-3">Help & Support</span>}
          </NavLink>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;