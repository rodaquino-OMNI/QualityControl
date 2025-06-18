export interface MetricData {
  label: string;
  value: number;
  change?: number;
  changeType?: 'increase' | 'decrease' | 'stable';
  unit?: string;
  icon?: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface CaseAnalytics {
  totalCases: number;
  approvedCases: number;
  deniedCases: number;
  pendingCases: number;
  averageProcessingTime: number;
  fraudDetectionRate: number;
  aiConfidenceScore: number;
}

export interface TimeSeriesData {
  timestamp: Date;
  casesProcessed: number;
  avgProcessingTime: number;
  approvalRate: number;
  aiUsageRate: number;
}

export interface AuditorPerformance {
  auditorId: string;
  auditorName: string;
  casesReviewed: number;
  avgDecisionTime: number;
  accuracy: number;
  aiAssistanceRate: number;
}

export interface FraudPattern {
  id: string;
  type: string;
  riskScore: number;
  occurrences: number;
  description: string;
  detectedDate: Date;
  providers?: string[];
}

export interface KPIMetric {
  id: string;
  name: string;
  value: number;
  target: number;
  trend: 'up' | 'down' | 'stable';
  percentage: number;
  period: string;
}

export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv';
  dateRange: {
    start: Date;
    end: Date;
  };
  metrics: string[];
  includeCharts?: boolean;
}

export interface DashboardFilter {
  dateRange: {
    start: Date;
    end: Date;
  };
  auditors?: string[];
  caseTypes?: string[];
  priority?: 'high' | 'medium' | 'low';
  fraudRiskLevel?: 'high' | 'medium' | 'low';
}