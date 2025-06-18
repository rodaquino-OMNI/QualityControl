import React, { useState, useEffect } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { AuditorPerformance } from '../../types/analytics';

interface AuditorPerformanceChartProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  auditors?: string[];
}

const AuditorPerformanceChart: React.FC<AuditorPerformanceChartProps> = ({ dateRange, auditors }) => {
  const [viewType, setViewType] = useState<'bar' | 'radar'>('bar');
  const [selectedMetric, setSelectedMetric] = useState<'cases' | 'time' | 'accuracy' | 'ai'>('cases');
  
  // Mock auditor performance data
  const performanceData: AuditorPerformance[] = [
    {
      auditorId: '1',
      auditorName: 'Ana Silva',
      casesReviewed: 245,
      avgDecisionTime: 3.2,
      accuracy: 98.5,
      aiAssistanceRate: 78
    },
    {
      auditorId: '2',
      auditorName: 'Carlos Santos',
      casesReviewed: 198,
      avgDecisionTime: 4.1,
      accuracy: 97.2,
      aiAssistanceRate: 85
    },
    {
      auditorId: '3',
      auditorName: 'Maria Costa',
      casesReviewed: 312,
      avgDecisionTime: 2.8,
      accuracy: 99.1,
      aiAssistanceRate: 65
    },
    {
      auditorId: '4',
      auditorName: 'João Oliveira',
      casesReviewed: 276,
      avgDecisionTime: 3.5,
      accuracy: 98.8,
      aiAssistanceRate: 72
    },
    {
      auditorId: '5',
      auditorName: 'Patricia Lima',
      casesReviewed: 189,
      avgDecisionTime: 3.9,
      accuracy: 97.8,
      aiAssistanceRate: 82
    }
  ];

  // Filter data based on selected auditors
  const filteredData = auditors && auditors.length > 0
    ? performanceData.filter(p => auditors.includes(p.auditorId))
    : performanceData;

  // Prepare data for radar chart
  const radarData = filteredData.map(auditor => ({
    auditor: auditor.auditorName.split(' ')[0],
    cases: (auditor.casesReviewed / 350) * 100,
    speed: ((5 - auditor.avgDecisionTime) / 5) * 100,
    accuracy: auditor.accuracy,
    aiUsage: auditor.aiAssistanceRate
  }));

  // Get metric-specific data for bar chart
  const getBarChartData = () => {
    switch (selectedMetric) {
      case 'cases':
        return filteredData.map(a => ({
          name: a.auditorName,
          value: a.casesReviewed,
          fill: '#3B82F6'
        }));
      case 'time':
        return filteredData.map(a => ({
          name: a.auditorName,
          value: a.avgDecisionTime,
          fill: '#F59E0B'
        }));
      case 'accuracy':
        return filteredData.map(a => ({
          name: a.auditorName,
          value: a.accuracy,
          fill: '#10B981'
        }));
      case 'ai':
        return filteredData.map(a => ({
          name: a.auditorName,
          value: a.aiAssistanceRate,
          fill: '#8B5CF6'
        }));
      default:
        return [];
    }
  };

  const metricLabels = {
    cases: 'Casos Revisados',
    time: 'Tempo Médio (min)',
    accuracy: 'Precisão (%)',
    ai: 'Uso de IA (%)'
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;

    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="font-semibold text-gray-900 dark:text-white">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="text-sm">
            <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
            <span className="ml-2 font-medium text-gray-900 dark:text-white">
              {entry.value.toFixed(1)}{selectedMetric === 'cases' ? '' : selectedMetric === 'time' ? ' min' : '%'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Calculate team averages
  const teamAverages = {
    avgCases: Math.round(filteredData.reduce((acc, a) => acc + a.casesReviewed, 0) / filteredData.length),
    avgTime: (filteredData.reduce((acc, a) => acc + a.avgDecisionTime, 0) / filteredData.length).toFixed(1),
    avgAccuracy: (filteredData.reduce((acc, a) => acc + a.accuracy, 0) / filteredData.length).toFixed(1),
    avgAI: Math.round(filteredData.reduce((acc, a) => acc + a.aiAssistanceRate, 0) / filteredData.length)
  };

  return (
    <div>
      {/* View Type Selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setViewType('bar')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              viewType === 'bar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Barras
          </button>
          <button
            onClick={() => setViewType('radar')}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              viewType === 'radar'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Radar
          </button>
        </div>

        {viewType === 'bar' && (
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as any)}
            className="px-3 py-1 rounded-md text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-0 focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(metricLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Chart */}
      <div className="h-64 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          {viewType === 'bar' ? (
            <BarChart data={getBarChartData()}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                {getBarChartData().map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <RadarChart data={radarData}>
              <PolarGrid strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="auditor" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <Radar name="Casos" dataKey="cases" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
              <Radar name="Velocidade" dataKey="speed" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.3} />
              <Radar name="Precisão" dataKey="accuracy" stroke="#10B981" fill="#10B981" fillOpacity={0.3} />
              <Radar name="Uso IA" dataKey="aiUsage" stroke="#8B5CF6" fill="#8B5CF6" fillOpacity={0.3} />
              <Tooltip />
              <Legend />
            </RadarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Team Averages */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
          <div className="text-xs text-blue-600 dark:text-blue-400">Média Casos</div>
          <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{teamAverages.avgCases}</div>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg text-center">
          <div className="text-xs text-yellow-600 dark:text-yellow-400">Tempo Médio</div>
          <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{teamAverages.avgTime} min</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-center">
          <div className="text-xs text-green-600 dark:text-green-400">Precisão Média</div>
          <div className="text-lg font-bold text-green-700 dark:text-green-300">{teamAverages.avgAccuracy}%</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg text-center">
          <div className="text-xs text-purple-600 dark:text-purple-400">Uso IA Médio</div>
          <div className="text-lg font-bold text-purple-700 dark:text-purple-300">{teamAverages.avgAI}%</div>
        </div>
      </div>

      {/* Top Performer Badge */}
      <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center">
              <span className="text-white font-bold text-sm">1º</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                Top Performer: {filteredData.sort((a, b) => b.accuracy - a.accuracy)[0]?.auditorName}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {filteredData[0]?.accuracy}% de precisão • {filteredData[0]?.casesReviewed} casos
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditorPerformanceChart;