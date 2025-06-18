import React, { useState } from 'react';
import { format } from 'date-fns';
import { DashboardFilter } from '../../types/analytics';

interface FilterPanelProps {
  filters: DashboardFilter;
  onFilterChange: (filters: DashboardFilter) => void;
  className?: string;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ filters, onFilterChange, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const auditorOptions = [
    { id: '1', name: 'Ana Silva' },
    { id: '2', name: 'Carlos Santos' },
    { id: '3', name: 'Maria Costa' },
    { id: '4', name: 'João Oliveira' },
    { id: '5', name: 'Patricia Lima' }
  ];

  const caseTypeOptions = [
    'Cirurgia',
    'Exame',
    'Consulta',
    'Internação',
    'Emergência'
  ];

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    onFilterChange({
      ...filters,
      dateRange: {
        ...filters.dateRange,
        [field]: new Date(value)
      }
    });
  };

  const handleAuditorToggle = (auditorId: string) => {
    const currentAuditors = filters.auditors || [];
    const newAuditors = currentAuditors.includes(auditorId)
      ? currentAuditors.filter(id => id !== auditorId)
      : [...currentAuditors, auditorId];
    
    onFilterChange({
      ...filters,
      auditors: newAuditors
    });
  };

  const handleCaseTypeToggle = (caseType: string) => {
    const currentTypes = filters.caseTypes || [];
    const newTypes = currentTypes.includes(caseType)
      ? currentTypes.filter(type => type !== caseType)
      : [...currentTypes, caseType];
    
    onFilterChange({
      ...filters,
      caseTypes: newTypes
    });
  };

  const quickDateFilters = [
    { label: 'Hoje', days: 0 },
    { label: '7 dias', days: 7 },
    { label: '30 dias', days: 30 },
    { label: '90 dias', days: 90 }
  ];

  const activeFiltersCount = 
    (filters.auditors?.length || 0) + 
    (filters.caseTypes?.length || 0) + 
    (filters.priority ? 1 : 0) + 
    (filters.fraudRiskLevel ? 1 : 0);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filtros
          {activeFiltersCount > 0 && (
            <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
              {activeFiltersCount}
            </span>
          )}
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg 
            className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Date Range - Always visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Data Inicial
          </label>
          <input
            type="date"
            value={format(filters.dateRange.start, 'yyyy-MM-dd')}
            onChange={(e) => handleDateChange('start', e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Data Final
          </label>
          <input
            type="date"
            value={format(filters.dateRange.end, 'yyyy-MM-dd')}
            onChange={(e) => handleDateChange('end', e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            Filtros Rápidos
          </label>
          <div className="flex gap-2">
            {quickDateFilters.map((filter) => (
              <button
                key={filter.days}
                onClick={() => {
                  const end = new Date();
                  const start = new Date();
                  start.setDate(start.getDate() - filter.days);
                  onFilterChange({
                    ...filters,
                    dateRange: { start, end }
                  });
                }}
                className="px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          {/* Auditors */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Auditores
            </label>
            <div className="flex flex-wrap gap-2">
              {auditorOptions.map((auditor) => (
                <button
                  key={auditor.id}
                  onClick={() => handleAuditorToggle(auditor.id)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    filters.auditors?.includes(auditor.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {auditor.name}
                </button>
              ))}
            </div>
          </div>

          {/* Case Types */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tipos de Caso
            </label>
            <div className="flex flex-wrap gap-2">
              {caseTypeOptions.map((type) => (
                <button
                  key={type}
                  onClick={() => handleCaseTypeToggle(type)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    filters.caseTypes?.includes(type)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Priority and Fraud Risk */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Prioridade
              </label>
              <select
                value={filters.priority || ''}
                onChange={(e) => onFilterChange({
                  ...filters,
                  priority: e.target.value as 'high' | 'medium' | 'low' | undefined
                })}
                className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Risco de Fraude
              </label>
              <select
                value={filters.fraudRiskLevel || ''}
                onChange={(e) => onFilterChange({
                  ...filters,
                  fraudRiskLevel: e.target.value as 'high' | 'medium' | 'low' | undefined
                })}
                className="w-full px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos</option>
                <option value="high">Alto</option>
                <option value="medium">Médio</option>
                <option value="low">Baixo</option>
              </select>
            </div>
          </div>

          {/* Clear Filters Button */}
          <div className="flex justify-end">
            <button
              onClick={() => onFilterChange({
                dateRange: filters.dateRange,
                auditors: [],
                caseTypes: [],
                priority: undefined,
                fraudRiskLevel: undefined
              })}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterPanel;