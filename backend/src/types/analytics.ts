export interface AnalyticsQuery {
  startDate: Date;
  endDate: Date;
  metrics?: string[];
  groupBy?: 'day' | 'week' | 'month' | 'hour';
  auditors?: string[];
  caseTypes?: string[];
  priority?: 'high' | 'medium' | 'low';
  fraudRiskLevel?: 'high' | 'medium' | 'low';
}

export interface CaseMetrics {
  totalCases: number;
  approvedCases: number;
  deniedCases: number;
  pendingCases: number;
  averageProcessingTime: number;
  medianProcessingTime: number;
  maxProcessingTime: number;
  minProcessingTime: number;
}

export interface PerformanceMetrics {
  auditorId: string;
  auditorName: string;
  casesReviewed: number;
  avgDecisionTime: number;
  accuracy: number;
  aiAssistanceRate: number;
  overturnRate: number;
  productivityScore: number;
}

export interface FraudMetrics {
  totalDetections: number;
  confirmedFrauds: number;
  falsePositives: number;
  suspiciousCases: number;
  fraudPatterns: FraudPattern[];
  preventedLoss: number;
  detectionAccuracy: number;
}

export interface FraudPattern {
  id: string;
  type: string;
  riskScore: number;
  occurrences: number;
  description: string;
  detectedDate: Date;
  providers: string[];
  totalValue: number;
}

export interface AIMetrics {
  aiUsageRate: number;
  averageConfidenceScore: number;
  modelAccuracy: number;
  overturnedDecisions: number;
  processingTimeReduction: number;
  costSavings: number;
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  casesProcessed: number;
  avgProcessingTime: number;
  approvalRate: number;
  aiUsageRate: number;
  fraudDetectionRate: number;
}

export interface KPIData {
  id: string;
  name: string;
  value: number;
  target: number;
  trend: 'up' | 'down' | 'stable';
  percentageChange: number;
  period: string;
  lastUpdated: Date;
}

export interface AggregatedMetrics {
  dateRange: {
    start: Date;
    end: Date;
  };
  caseMetrics: CaseMetrics;
  performanceMetrics: PerformanceMetrics[];
  fraudMetrics: FraudMetrics;
  aiMetrics: AIMetrics;
  timeSeries: TimeSeriesDataPoint[];
  kpis: KPIData[];
}

export interface RealTimeMetric {
  metric: string;
  value: number;
  timestamp: Date;
  change: number;
  trend: number[];
}