import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { MetricData } from '../../types/analytics';

interface MetricsOverviewProps {
  selectedMetric: string;
  dateRange: {
    start: Date;
    end: Date;
  };
}

const MetricsOverview: React.FC<MetricsOverviewProps> = ({ selectedMetric, dateRange }) => {
  // Mock data based on selected metric
  const getMetricData = () => {
    switch (selectedMetric) {
      case 'processing-time':
        return {
          title: 'Distribuição de Tempo',
          data: [
            { name: '< 3 min', value: 35, color: '#10B981' },
            { name: '3-5 min', value: 45, color: '#3B82F6' },
            { name: '5-10 min', value: 15, color: '#F59E0B' },
            { name: '> 10 min', value: 5, color: '#EF4444' }
          ],
          insights: [
            '80% dos casos processados em menos de 5 minutos',
            'Melhoria de 15% comparado ao mês anterior',
            'Casos complexos representam apenas 5% do total'
          ]
        };
      
      case 'automation-rate':
        return {
          title: 'Taxa de Automação',
          data: [
            { name: 'Automatizado', value: 87, color: '#10B981' },
            { name: 'Manual', value: 13, color: '#6B7280' }
          ],
          insights: [
            'Meta de 85% ultrapassada',
            'Economia de 1,240 horas de trabalho manual',
            'ROI de 320% na automação implementada'
          ]
        };
      
      case 'accuracy':
        return {
          title: 'Precisão por Tipo',
          data: [
            { name: 'Cirurgia', value: 99.8, color: '#10B981' },
            { name: 'Exame', value: 99.5, color: '#3B82F6' },
            { name: 'Consulta', value: 99.9, color: '#8B5CF6' },
            { name: 'Internação', value: 99.2, color: '#F59E0B' }
          ],
          insights: [
            'Precisão geral acima da meta de 99.5%',
            'Apenas 3 decisões revertidas no período',
            'Melhoria contínua nos últimos 6 meses'
          ]
        };
      
      case 'fraud-detection':
        return {
          title: 'Detecções de Fraude',
          data: [
            { name: 'Confirmadas', value: 68, color: '#EF4444' },
            { name: 'Suspeitas', value: 26, color: '#F59E0B' },
            { name: 'Falso Positivo', value: 6, color: '#6B7280' }
          ],
          insights: [
            'R$ 2.3M em fraudes evitadas',
            'Taxa de falso positivo reduzida para 6%',
            '94% de precisão na detecção'
          ]
        };
      
      default:
        return {
          title: 'Visão Geral',
          data: [
            { name: 'Aprovados', value: 1168, color: '#10B981' },
            { name: 'Negados', value: 355, color: '#EF4444' },
            { name: 'Pendentes', value: 87, color: '#F59E0B' }
          ],
          insights: [
            'Taxa de aprovação de 76.6%',
            '1,523 casos processados no período',
            'Tempo médio de resposta: 4.2 minutos'
          ]
        };
    }
  };

  const metricInfo = getMetricData();

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;

    return (
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <p className="font-semibold text-gray-900 dark:text-white">
          {payload[0].name}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Valor: {payload[0].value}
          {selectedMetric === 'accuracy' ? '%' : ''}
        </p>
        {selectedMetric === 'overview' && (
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {((payload[0].value / 1523) * 100).toFixed(1)}% do total
          </p>
        )}
      </div>
    );
  };

  const renderLabel = (entry: any) => {
    if (selectedMetric === 'accuracy') {
      return `${entry.value}%`;
    }
    return entry.value;
  };

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        {metricInfo.title}
      </h4>

      {/* Pie Chart */}
      <div className="h-48 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={metricInfo.data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderLabel}
              outerRadius={60}
              fill="#8884d8"
              dataKey="value"
            >
              {metricInfo.data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value) => <span className="text-xs">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Key Insights */}
      <div className="space-y-2">
        <h5 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
          Insights Principais
        </h5>
        {metricInfo.insights.map((insight, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="w-1 h-1 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              {insight}
            </p>
          </div>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {metricInfo.data.reduce((acc, item) => acc + item.value, 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Maior</div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {Math.max(...metricInfo.data.map(item => item.value))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsOverview;