import React, { useState } from 'react';
import { subDays } from 'date-fns';
import type { DashboardFilter, KPIMetric } from '../../types/analytics';
import KPICard from './KPICard';
import MetricsOverview from './MetricsOverview';
import CaseAnalysisChart from './CaseAnalysisChart';
import FraudDetectionVisualizer from './FraudDetectionVisualizer';
import AuditorPerformanceChart from './AuditorPerformanceChart';
import ExportControls from './ExportControls';
import FilterPanel from './FilterPanel';
import RealTimeMetrics from './RealTimeMetrics';

const AnalyticsDashboard: React.FC = () => {
  const [filters, setFilters] = useState<DashboardFilter>({
    dateRange: {
      start: subDays(new Date(), 30),
      end: new Date()
    }
  });
  
  const [selectedMetric, setSelectedMetric] = useState<string>('overview');
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);

  // Mock KPI data - would come from Redux store in real implementation
  const kpiMetrics: KPIMetric[] = [
    {
      id: 'processing-time',
      name: 'Tempo Médio de Análise',
      value: 4.2,
      target: 5,
      trend: 'down',
      percentage: -16,
      period: 'min'
    },
    {
      id: 'automation-rate',
      name: 'Taxa de Automação',
      value: 87,
      target: 85,
      trend: 'up',
      percentage: 2.4,
      period: '%'
    },
    {
      id: 'accuracy',
      name: 'Precisão das Decisões',
      value: 99.7,
      target: 99.5,
      trend: 'up',
      percentage: 0.2,
      period: '%'
    },
    {
      id: 'fraud-detection',
      name: 'Taxa de Detecção de Fraudes',
      value: 94.3,
      target: 90,
      trend: 'up',
      percentage: 4.8,
      period: '%'
    }
  ];

  const handleFilterChange = (newFilters: DashboardFilter) => {
    setFilters(newFilters);
    // Dispatch action to fetch new data based on filters
  };

  const handleExport = (options: any) => {
    // Implement export logic
    console.log('Exporting with options:', options);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Analytics Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Monitore métricas e KPIs em tempo real do AUSTA Cockpit
          </p>
        </div>

        {/* Filter Panel */}
        <FilterPanel 
          filters={filters} 
          onFilterChange={handleFilterChange}
          className="mb-6"
        />

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {kpiMetrics.map((metric) => (
            <KPICard 
              key={metric.id} 
              metric={metric}
              onClick={() => setSelectedMetric(metric.id)}
              isSelected={selectedMetric === metric.id}
            />
          ))}
        </div>

        {/* Real-time Metrics Toggle */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Análise Detalhada
          </h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isRealTimeEnabled}
                onChange={(e) => setIsRealTimeEnabled(e.target.checked)}
                className="sr-only"
              />
              <div className={`relative w-11 h-6 rounded-full transition-colors ${
                isRealTimeEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}>
                <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  isRealTimeEnabled ? 'translate-x-5' : ''
                }`} />
              </div>
              <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                Tempo Real
              </span>
            </label>
            <ExportControls onExport={handleExport} />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - 2/3 width */}
          <div className="lg:col-span-2 space-y-6">
            {/* Case Analysis Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Análise de Casos
              </h3>
              <CaseAnalysisChart 
                dateRange={filters.dateRange}
                isRealTime={isRealTimeEnabled}
              />
            </div>

            {/* Auditor Performance */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Performance dos Auditores
              </h3>
              <AuditorPerformanceChart 
                dateRange={filters.dateRange}
                auditors={filters.auditors}
              />
            </div>
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-6">
            {/* Real-time Metrics */}
            {isRealTimeEnabled && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Métricas em Tempo Real
                </h3>
                <RealTimeMetrics />
              </div>
            )}

            {/* Fraud Detection */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Detecção de Fraudes
              </h3>
              <FraudDetectionVisualizer 
                riskLevel={filters.fraudRiskLevel}
              />
            </div>

            {/* Metrics Overview */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Visão Geral
              </h3>
              <MetricsOverview 
                selectedMetric={selectedMetric}
                dateRange={filters.dateRange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;