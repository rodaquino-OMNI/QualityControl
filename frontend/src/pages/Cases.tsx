import React, { useState } from 'react';
import CaseFilters from '@/components/cases/CaseFilters';
import CaseListItem from '@/components/cases/CaseListItem';

const Cases: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({});

  // Mock data - replace with API calls
  const cases = [
    {
      id: '1',
      title: 'Post-operative infection monitoring',
      patientId: 'P-2024-001',
      patientName: 'John Doe',
      priority: 'high' as const,
      status: 'open' as const,
      assignedTo: 'Dr. Smith',
      createdAt: '2024-01-15',
      updatedAt: '2 hours ago',
    },
    {
      id: '2',
      title: 'Medication adherence review',
      patientId: 'P-2024-002',
      patientName: 'Jane Smith',
      priority: 'medium' as const,
      status: 'in_progress' as const,
      assignedTo: 'Dr. Johnson',
      createdAt: '2024-01-14',
      updatedAt: '1 day ago',
    },
    {
      id: '3',
      title: 'Diagnostic test follow-up',
      patientId: 'P-2024-003',
      patientName: 'Robert Brown',
      priority: 'low' as const,
      status: 'resolved' as const,
      assignedTo: 'Dr. Williams',
      createdAt: '2024-01-13',
      updatedAt: '3 days ago',
    },
  ];

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters({ ...filters, ...newFilters });
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Cases
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage and track all quality control cases
            </p>
          </div>
          <button className="btn-primary">
            Create New Case
          </button>
        </div>
      </div>

      <CaseFilters onSearch={handleSearch} onFilterChange={handleFilterChange} />

      <div className="space-y-4">
        {cases.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">
              No cases found matching your criteria
            </p>
          </div>
        ) : (
          cases.map((caseItem) => (
            <CaseListItem key={caseItem.id} case={caseItem} />
          ))
        )}
      </div>
    </div>
  );
};

export default Cases;