import React from 'react';
import type { KPIMetric } from '../../types/analytics';

interface KPICardProps {
  metric: KPIMetric;
  onClick?: () => void;
  isSelected?: boolean;
}

const KPICard: React.FC<KPICardProps> = ({ metric, onClick, isSelected = false }) => {
  const getTrendIcon = () => {
    if (metric.trend === 'up') {
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      );
    } else if (metric.trend === 'down') {
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M5 12h14" />
      </svg>
    );
  };

  const getTrendColor = () => {
    if (metric.percentage > 0) {
      return metric.value >= metric.target ? 'text-green-600' : 'text-red-600';
    } else if (metric.percentage < 0) {
      return metric.value <= metric.target ? 'text-green-600' : 'text-red-600';
    }
    return 'text-gray-600';
  };

  const getProgressWidth = () => {
    const percentage = Math.min((metric.value / metric.target) * 100, 100);
    return `${percentage}%`;
  };

  return (
    <div 
      onClick={onClick}
      className={`
        bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 cursor-pointer
        transition-all duration-200 hover:shadow-lg
        ${isSelected ? 'ring-2 ring-blue-500' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {metric.name}
        </h3>
        <div className={`flex items-center gap-1 ${getTrendColor()}`}>
          {getTrendIcon()}
          <span className="text-sm font-semibold">
            {metric.percentage > 0 ? '+' : ''}{metric.percentage}%
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">
            {metric.value}
          </span>
          <span className="text-lg text-gray-500 dark:text-gray-400">
            {metric.period}
          </span>
        </div>
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Meta: {metric.target} {metric.period}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
            style={{ width: getProgressWidth() }}
          />
        </div>
      </div>
    </div>
  );
};

export default KPICard;