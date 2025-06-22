import React from 'react';
import { SearchIcon, FilterIcon } from '@/components/common/Icons';

interface CaseFiltersProps {
  onSearch: (query: string) => void;
  onFilterChange: (filters: any) => void;
}

const CaseFilters: React.FC<CaseFiltersProps> = ({ onSearch, onFilterChange }) => {
  return (
    <div className="card mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        {/* Search */}
        <div className="relative flex-1 md:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <SearchIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="input pl-10"
            placeholder="Search cases..."
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-4">
          <select
            className="input"
            onChange={(e) => onFilterChange({ status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          <select
            className="input"
            onChange={(e) => onFilterChange({ priority: e.target.value })}
          >
            <option value="">All Priority</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <button className="btn-outline">
            <FilterIcon className="w-4 h-4 mr-2" />
            More Filters
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaseFilters;