import React, { useState, useEffect } from 'react';

interface Metric {
  label: string;
  value: number;
  unit: string;
  color: string;
  trend: number[];
}

const RealTimeMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<Metric[]>([
    {
      label: 'Casos/Hora',
      value: 127,
      unit: 'casos',
      color: '#3B82F6',
      trend: [120, 125, 122, 128, 127]
    },
    {
      label: 'Taxa de Aprovação',
      value: 76.8,
      unit: '%',
      color: '#10B981',
      trend: [75, 76, 77, 76.5, 76.8]
    },
    {
      label: 'Tempo Médio',
      value: 3.7,
      unit: 'min',
      color: '#F59E0B',
      trend: [4.2, 4.0, 3.9, 3.8, 3.7]
    },
    {
      label: 'IA Confidence',
      value: 92.3,
      unit: '%',
      color: '#8B5CF6',
      trend: [91, 91.5, 92, 92.1, 92.3]
    }
  ]);

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prevMetrics => 
        prevMetrics.map(metric => {
          const change = (Math.random() - 0.5) * 5;
          const newValue = Math.max(0, metric.value + change);
          const newTrend = [...metric.trend.slice(1), newValue];
          
          return {
            ...metric,
            value: Math.round(newValue * 10) / 10,
            trend: newTrend
          };
        })
      );
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const MiniSparkline: React.FC<{ data: number[], color: string }> = ({ data, color }) => {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const width = 60;
    const height = 20;
    
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="inline-block">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      {metrics.map((metric, index) => (
        <div 
          key={index}
          className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
        >
          <div className="flex-1">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {metric.label}
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-xl font-bold" style={{ color: metric.color }}>
                {metric.value}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {metric.unit}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MiniSparkline data={metric.trend} color={metric.color} />
            <div className={`text-xs font-medium ${
              metric.trend[metric.trend.length - 1] > metric.trend[metric.trend.length - 2]
                ? 'text-green-600'
                : 'text-red-600'
            }`}>
              {metric.trend[metric.trend.length - 1] > metric.trend[metric.trend.length - 2] ? '↑' : '↓'}
            </div>
          </div>
        </div>
      ))}

      {/* Active Cases Counter */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
              Casos Ativos Agora
            </div>
            <div className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">
              342
            </div>
          </div>
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-blue-500 animate-pulse" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* Queue Status */}
      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
          <div className="text-xs text-green-600 dark:text-green-400">Baixa</div>
          <div className="text-lg font-bold text-green-700 dark:text-green-300">87</div>
        </div>
        <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
          <div className="text-xs text-yellow-600 dark:text-yellow-400">Média</div>
          <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">156</div>
        </div>
        <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
          <div className="text-xs text-red-600 dark:text-red-400">Alta</div>
          <div className="text-lg font-bold text-red-700 dark:text-red-300">99</div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeMetrics;