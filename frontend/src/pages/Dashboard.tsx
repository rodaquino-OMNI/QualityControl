import React from 'react';
import StatsCard from '@/components/dashboard/StatsCard';
import RecentActivity from '@/components/dashboard/RecentActivity';
import { CasesIcon, UserIcon, ClockIcon, ExclamationIcon } from '@/components/common/Icons';

const Dashboard: React.FC = () => {
  // Mock data - replace with API calls
  const stats = {
    totalCases: 248,
    activeCases: 47,
    resolvedToday: 12,
    criticalCases: 3,
  };

  const activities = [
    {
      id: '1',
      type: 'case_created' as const,
      description: 'New case created for patient John Doe',
      timestamp: '2 hours ago',
      user: 'Dr. Smith',
    },
    {
      id: '2',
      type: 'case_resolved' as const,
      description: 'Case #245 resolved successfully',
      timestamp: '4 hours ago',
      user: 'Dr. Johnson',
    },
    {
      id: '3',
      type: 'comment_added' as const,
      description: 'Comment added to case #246',
      timestamp: '5 hours ago',
      user: 'Nurse Williams',
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Welcome back! Here's an overview of your quality control system.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Total Cases"
          value={stats.totalCases}
          change={{ value: 12, trend: 'up' }}
          icon={<CasesIcon className="w-6 h-6" />}
          color="primary"
        />
        <StatsCard
          title="Active Cases"
          value={stats.activeCases}
          change={{ value: 5, trend: 'down' }}
          icon={<ClockIcon className="w-6 h-6" />}
          color="secondary"
        />
        <StatsCard
          title="Resolved Today"
          value={stats.resolvedToday}
          change={{ value: 20, trend: 'up' }}
          icon={<UserIcon className="w-6 h-6" />}
          color="success"
        />
        <StatsCard
          title="Critical Cases"
          value={stats.criticalCases}
          change={{ value: 50, trend: 'up' }}
          icon={<ExclamationIcon className="w-6 h-6" />}
          color="danger"
        />
      </div>

      {/* Recent Activity and Other Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity activities={activities} />
        
        {/* Quick Actions */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <button className="w-full btn-primary">
              Create New Case
            </button>
            <button className="w-full btn-outline">
              View All Cases
            </button>
            <button className="w-full btn-outline">
              Generate Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;