import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRightIcon, ClockIcon, UserIcon } from '../common/Icons';

interface Case {
  id: string;
  title: string;
  patientId: string;
  patientName: string;
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
}

interface CaseListItemProps {
  case: Case;
}

const CaseListItem: React.FC<CaseListItemProps> = ({ case: caseData }) => {
  const getPriorityColor = (priority: Case['priority']) => {
    switch (priority) {
      case 'high':
        return 'border-danger-500 bg-danger-50 dark:bg-danger-900/10';
      case 'medium':
        return 'border-warning-500 bg-warning-50 dark:bg-warning-900/10';
      case 'low':
        return 'border-success-500 bg-success-50 dark:bg-success-900/10';
    }
  };

  const getStatusBadge = (status: Case['status']) => {
    const statusConfig = {
      open: { color: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200', label: 'Open' },
      in_progress: { color: 'bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200', label: 'In Progress' },
      resolved: { color: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200', label: 'Resolved' },
      closed: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200', label: 'Closed' },
    };

    const config = statusConfig[status];
    return (
      <span className={`status-badge ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <Link
      to={`/cases/${caseData.id}`}
      className={`block card case-list-item ${getPriorityColor(caseData.priority)} hover:shadow-lg`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {caseData.title}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Patient: {caseData.patientName} (ID: {caseData.patientId})
              </p>
            </div>
            {getStatusBadge(caseData.status)}
          </div>

          <div className="flex items-center space-x-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center">
              <UserIcon className="w-4 h-4 mr-1" />
              <span>{caseData.assignedTo}</span>
            </div>
            <div className="flex items-center">
              <ClockIcon className="w-4 h-4 mr-1" />
              <span>{caseData.updatedAt}</span>
            </div>
            <div className="flex items-center">
              <span className={`priority-${caseData.priority} px-2 py-1 rounded text-xs font-medium`}>
                {caseData.priority.toUpperCase()} Priority
              </span>
            </div>
          </div>
        </div>
        <ChevronRightIcon className="w-5 h-5 text-gray-400 ml-4 flex-shrink-0" />
      </div>
    </Link>
  );
};

export default CaseListItem;