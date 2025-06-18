import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart
} from 'recharts';
import { format, eachDayOfInterval, subDays } from 'date-fns';

interface CaseAnalysisChartProps {
  dateRange: {
    start: Date;
    end: Date;
  };
  isRealTime?: boolean;
}

const CaseAnalysisChart: React.FC<CaseAnalysisChartProps> = ({ dateRange, isRealTime = false }) => {
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar' | 'composed'>('composed');
  const [data, setData] = useState<any[]>([]);

  // Generate mock data based on date range
  useEffect(() => {
    const days = eachDayOfInterval({
      start: dateRange.start,
      end: dateRange.end
    });

    const mockData = days.map(date => ({
      date: format(date, 'dd/MM'),
      fullDate: date,
      totalCases: Math.floor(Math.random() * 200) + 300,
      approved: Math.floor(Math.random() * 150) + 200,
      denied: Math.floor(Math.random() * 30) + 20,
      pending: Math.floor(Math.random() * 20) + 10,
      avgProcessingTime: Math.random() * 5 + 2,
      aiAssisted: Math.floor(Math.random() * 100) + 150
    }));

    setData(mockData);
  }, [dateRange]);

  // Simulate real-time updates
  useEffect(() => {
    if (!isRealTime) return;

    const interval = setInterval(() => {
      setData(prevData => {
        const newData = [...prevData];
        const lastItem = newData[newData.length - 1];
        if (lastItem) {
          lastItem.totalCases += Math.floor(Math.random() * 5) - 2;
          lastItem.approved += Math.floor(Math.random() * 3) - 1;
          lastItem.avgProcessingTime = Math.max(0, lastItem.avgProcessingTime + (Math.random() - 0.5) * 0.5);
        }
        return newData;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [isRealTime]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;

    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {entry.value}{entry.unit || ''}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="totalCases" stroke="#3B82F6" name="Total de Casos" strokeWidth={2} />
            <Line type="monotone" dataKey="approved" stroke="#10B981" name="Aprovados" strokeWidth={2} />
            <Line type="monotone" dataKey="denied" stroke="#EF4444" name="Negados" strokeWidth={2} />
          </LineChart>
        );

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area type="monotone" dataKey="approved" stackId="1" stroke="#10B981" fill="#10B981" fillOpacity={0.6} name="Aprovados" />
            <Area type="monotone" dataKey="denied" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} name="Negados" />
            <Area type="monotone" dataKey="pending" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} name="Pendentes" />
          </AreaChart>
        );

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="totalCases" fill="#3B82F6" name="Total de Casos" />
            <Bar dataKey="aiAssisted" fill="#8B5CF6" name="Com IA" />
          </BarChart>
        );

      case 'composed':
      default:
        return (
          <ComposedChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar yAxisId="left" dataKey="totalCases" fill="#3B82F6" name="Total de Casos" />
            <Line yAxisId="right" type="monotone" dataKey="avgProcessingTime" stroke="#EF4444" name="Tempo Médio (min)" strokeWidth={2} />
          </ComposedChart>
        );
    }
  };

  return (
    <div>
      {/* Chart Type Selector */}
      <div className="flex gap-2 mb-4">
        {(['composed', 'line', 'area', 'bar'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setChartType(type)}
            className={`
              px-3 py-1 rounded-md text-sm font-medium transition-colors
              ${chartType === type 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }
            `}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* Real-time Indicator */}
      {isRealTime && (
        <div className="flex items-center gap-2 mt-4">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Atualizando em tempo real
          </span>
        </div>
      )}
    </div>
  );
};

export default CaseAnalysisChart;