import { 
  AnalyticsQuery, 
  AggregatedMetrics, 
  CaseMetrics, 
  PerformanceMetrics, 
  FraudMetrics, 
  AIMetrics,
  TimeSeriesDataPoint,
  KPIData,
  RealTimeMetric,
  FraudPattern
} from '../types/analytics';
import { startOfDay, endOfDay, eachDayOfInterval, format } from 'date-fns';
import { RedisService } from './redisService';
import { logger } from '../utils/logger';

export class AnalyticsService {
  constructor(private redisService: RedisService) {}

  async getAggregatedMetrics(query: AnalyticsQuery): Promise<AggregatedMetrics> {
    try {
      const cacheKey = this.generateCacheKey(query);
      const cached = await this.redisService.get(cacheKey);
      
      if (cached) {
        logger.info('Returning cached analytics data');
        return JSON.parse(cached);
      }

      const [caseMetrics, performanceMetrics, fraudMetrics, aiMetrics, timeSeries, kpis] = 
        await Promise.all([
          this.getCaseMetrics(query),
          this.getPerformanceMetrics(query),
          this.getFraudMetrics(query),
          this.getAIMetrics(query),
          this.getTimeSeriesData(query),
          this.getKPIs(query)
        ]);

      const aggregatedMetrics: AggregatedMetrics = {
        dateRange: {
          start: query.startDate,
          end: query.endDate
        },
        caseMetrics,
        performanceMetrics,
        fraudMetrics,
        aiMetrics,
        timeSeries,
        kpis
      };

      // Cache for 5 minutes
      await this.redisService.set(cacheKey, JSON.stringify(aggregatedMetrics), 300);

      return aggregatedMetrics;
    } catch (error) {
      logger.error('Error getting aggregated metrics:', error);
      throw error;
    }
  }

  async getCaseMetrics(query: AnalyticsQuery): Promise<CaseMetrics> {
    // Mock implementation - replace with actual database queries
    const totalCases = Math.floor(Math.random() * 500) + 1000;
    const approvedCases = Math.floor(totalCases * 0.76);
    const deniedCases = Math.floor(totalCases * 0.20);
    const pendingCases = totalCases - approvedCases - deniedCases;

    return {
      totalCases,
      approvedCases,
      deniedCases,
      pendingCases,
      averageProcessingTime: 4.2,
      medianProcessingTime: 3.8,
      maxProcessingTime: 45.3,
      minProcessingTime: 0.5
    };
  }

  async getPerformanceMetrics(query: AnalyticsQuery): Promise<PerformanceMetrics[]> {
    // Mock data - replace with actual database queries
    const auditors = [
      { id: '1', name: 'Ana Silva' },
      { id: '2', name: 'Carlos Santos' },
      { id: '3', name: 'Maria Costa' },
      { id: '4', name: 'João Oliveira' },
      { id: '5', name: 'Patricia Lima' }
    ];

    return auditors
      .filter(a => !query.auditors || query.auditors.includes(a.id))
      .map(auditor => ({
        auditorId: auditor.id,
        auditorName: auditor.name,
        casesReviewed: Math.floor(Math.random() * 150) + 150,
        avgDecisionTime: Math.random() * 2 + 2.5,
        accuracy: Math.random() * 2 + 97.5,
        aiAssistanceRate: Math.random() * 20 + 70,
        overturnRate: Math.random() * 2 + 0.5,
        productivityScore: Math.random() * 10 + 85
      }));
  }

  async getFraudMetrics(query: AnalyticsQuery): Promise<FraudMetrics> {
    const totalDetections = Math.floor(Math.random() * 50) + 100;
    const confirmedFrauds = Math.floor(totalDetections * 0.68);
    const falsePositives = Math.floor(totalDetections * 0.06);
    const suspiciousCases = totalDetections - confirmedFrauds - falsePositives;

    const fraudPatterns: FraudPattern[] = [
      {
        id: '1',
        type: 'Billing Anomaly',
        riskScore: 92,
        occurrences: 23,
        description: 'Unusual billing patterns detected',
        detectedDate: new Date(),
        providers: ['Provider A', 'Provider B'],
        totalValue: 125000
      },
      {
        id: '2',
        type: 'Duplicate Claims',
        riskScore: 78,
        occurrences: 15,
        description: 'Multiple similar claims submitted',
        detectedDate: new Date(),
        providers: ['Provider C'],
        totalValue: 87000
      }
    ];

    return {
      totalDetections,
      confirmedFrauds,
      falsePositives,
      suspiciousCases,
      fraudPatterns,
      preventedLoss: 2300000,
      detectionAccuracy: 94.3
    };
  }

  async getAIMetrics(query: AnalyticsQuery): Promise<AIMetrics> {
    return {
      aiUsageRate: 87.5,
      averageConfidenceScore: 92.3,
      modelAccuracy: 99.7,
      overturnedDecisions: 12,
      processingTimeReduction: 85.6,
      costSavings: 1240000
    };
  }

  async getTimeSeriesData(query: AnalyticsQuery): Promise<TimeSeriesDataPoint[]> {
    const days = eachDayOfInterval({
      start: query.startDate,
      end: query.endDate
    });

    return days.map(date => ({
      timestamp: date,
      casesProcessed: Math.floor(Math.random() * 100) + 50,
      avgProcessingTime: Math.random() * 2 + 3,
      approvalRate: Math.random() * 10 + 70,
      aiUsageRate: Math.random() * 10 + 80,
      fraudDetectionRate: Math.random() * 5 + 90
    }));
  }

  async getKPIs(query: AnalyticsQuery): Promise<KPIData[]> {
    return [
      {
        id: 'processing-time',
        name: 'Tempo Médio de Análise',
        value: 4.2,
        target: 5,
        trend: 'down',
        percentageChange: -16,
        period: 'min',
        lastUpdated: new Date()
      },
      {
        id: 'automation-rate',
        name: 'Taxa de Automação',
        value: 87,
        target: 85,
        trend: 'up',
        percentageChange: 2.4,
        period: '%',
        lastUpdated: new Date()
      },
      {
        id: 'accuracy',
        name: 'Precisão das Decisões',
        value: 99.7,
        target: 99.5,
        trend: 'up',
        percentageChange: 0.2,
        period: '%',
        lastUpdated: new Date()
      },
      {
        id: 'fraud-detection',
        name: 'Taxa de Detecção de Fraudes',
        value: 94.3,
        target: 90,
        trend: 'up',
        percentageChange: 4.8,
        period: '%',
        lastUpdated: new Date()
      }
    ];
  }

  async getRealTimeMetrics(): Promise<RealTimeMetric[]> {
    return [
      {
        metric: 'cases_per_hour',
        value: 127,
        timestamp: new Date(),
        change: 5.2,
        trend: [120, 125, 122, 128, 127]
      },
      {
        metric: 'approval_rate',
        value: 76.8,
        timestamp: new Date(),
        change: -1.2,
        trend: [75, 76, 77, 76.5, 76.8]
      },
      {
        metric: 'avg_processing_time',
        value: 3.7,
        timestamp: new Date(),
        change: -0.3,
        trend: [4.2, 4.0, 3.9, 3.8, 3.7]
      },
      {
        metric: 'ai_confidence',
        value: 92.3,
        timestamp: new Date(),
        change: 0.5,
        trend: [91, 91.5, 92, 92.1, 92.3]
      }
    ];
  }

  async exportAnalytics(query: AnalyticsQuery, format: 'csv' | 'json'): Promise<string | object> {
    const data = await this.getAggregatedMetrics(query);
    
    if (format === 'json') {
      return data;
    }

    // Convert to CSV format
    const csvRows: string[] = [];
    
    // Headers
    csvRows.push('Metric,Value,Target,Change');
    
    // KPI data
    data.kpis.forEach(kpi => {
      csvRows.push(`${kpi.name},${kpi.value}${kpi.period},${kpi.target}${kpi.period},${kpi.percentageChange}%`);
    });

    return csvRows.join('\n');
  }

  private generateCacheKey(query: AnalyticsQuery): string {
    const parts = [
      'analytics',
      format(query.startDate, 'yyyy-MM-dd'),
      format(query.endDate, 'yyyy-MM-dd'),
      query.groupBy || 'day',
      query.auditors?.join(',') || 'all',
      query.caseTypes?.join(',') || 'all',
      query.priority || 'all',
      query.fraudRiskLevel || 'all'
    ];
    
    return parts.join(':');
  }
}