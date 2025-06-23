import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { logger } from '../../utils/logger';

interface FeatureVector {
  patientFeatures: PatientFeatures;
  providerFeatures: ProviderFeatures;
  procedureFeatures: ProcedureFeatures;
  temporalFeatures: TemporalFeatures;
  contextualFeatures: ContextualFeatures;
}

interface PatientFeatures {
  // Demographics
  ageGroup: number; // 0-5 age group encoding
  genderEncoded: number; // Binary encoding
  
  // Risk Profile
  riskCategoryScore: number; // 0-1 normalized
  chronicConditionCount: number;
  chronicConditionComplexity: number; // Weighted complexity score
  
  // Historical Patterns
  authorizationHistoryCount: number;
  avgAuthorizationValue: number;
  authorizationApprovalRate: number;
  recentActivityFrequency: number; // Requests in last 30 days
  
  // Behavioral Indicators
  unusualRequestPatterns: number; // 0-1 anomaly score
  providerSwitchingFrequency: number;
  timeOfRequestPattern: number; // Pattern score for request timing
}

interface ProviderFeatures {
  // Performance Metrics
  approvalRate: number;
  avgProcessingTime: number;
  qualityScore: number;
  complianceScore: number;
  
  // Volume Patterns
  requestVolumePercentile: number;
  requestValuePercentile: number;
  specialtyFocusScore: number; // How focused on specific procedures
  
  // Risk Indicators
  fraudIncidentRate: number;
  anomalyScore: number; // Statistical deviation from peers
  peersComparisonScore: number; // Relative to similar providers
  
  // Network Analysis
  referralNetworkSize: number;
  referralPatternComplexity: number;
  collaborationScore: number;
}

interface ProcedureFeatures {
  // Procedure Characteristics
  complexityScore: number; // Based on typical duration, risk level
  requiresPreauth: number; // Binary
  procedureCategoryEncoded: number;
  
  // Market Analysis
  procedureFrequency: number; // How common this procedure is
  avgMarketValue: number;
  valuePercentile: number; // Where this request sits in value distribution
  
  // Risk Assessment
  proceduralRiskLevel: number; // 0-1 normalized
  complicationRate: number; // Historical complication rates
  reviewRequirementScore: number; // Likelihood of requiring review
}

interface TemporalFeatures {
  // Timing Patterns
  dayOfWeek: number;
  monthOfYear: number;
  hourOfDay: number;
  isWeekend: number;
  isHoliday: number;
  
  // Seasonal Patterns
  seasonalityScore: number; // Expected volume for this time period
  trendScore: number; // Recent trend in similar requests
  
  // Urgency Context
  timeToDeadline: number; // Hours until due date
  urgencyLevelNormalized: number;
  processingTimeRemaining: number;
}

interface ContextualFeatures {
  // System Load
  currentSystemLoad: number; // Current processing queue size
  reviewerAvailability: number; // Available reviewer capacity
  
  // Economic Context
  monthlyBudgetUtilization: number; // How much of budget used
  costPressureIndicator: number; // Financial pressure score
  
  // Regulatory Context
  recentPolicyChanges: number; // Impact score of recent changes
  complianceRiskLevel: number;
  
  // Quality Indicators
  documentQualityScore: number; // Completeness and quality of docs
  justificationClarity: number; // NLP score for justification text
  supportingEvidenceScore: number; // Quality of supporting evidence
}

export class FeatureEngineeringService {
  private prisma: PrismaClient;
  private redis: Redis;
  private featureCache: Map<string, any> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async extractFeatureVector(authorizationRequestId: string): Promise<FeatureVector> {
    try {
      const cacheKey = `features:${authorizationRequestId}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Get authorization request with related data
      const authRequest = await this.prisma.authorizationRequest.findUnique({
        where: { id: authorizationRequestId },
        include: {
          patient: true,
          requestingProvider: true,
          requestingDoctor: true,
          procedure: true,
          decisions: true,
        }
      });

      if (!authRequest) {
        throw new Error(`Authorization request not found: ${authorizationRequestId}`);
      }

      const features: FeatureVector = {
        patientFeatures: await this.extractPatientFeatures(authRequest.patient),
        providerFeatures: await this.extractProviderFeatures(authRequest.requestingProvider),
        procedureFeatures: await this.extractProcedureFeatures(authRequest.procedure),
        temporalFeatures: await this.extractTemporalFeatures(authRequest),
        contextualFeatures: await this.extractContextualFeatures(authRequest)
      };

      // Cache for 1 hour
      await this.redis.setex(cacheKey, 3600, JSON.stringify(features));

      return features;
    } catch (error) {
      logger.error('Feature extraction failed:', error);
      throw error;
    }
  }

  private async extractPatientFeatures(patient: any): Promise<PatientFeatures> {
    // Get patient history
    const patientHistory = await this.prisma.authorizationRequest.findMany({
      where: { patientId: patient.id },
      include: { 
        decisions: true,
        claims: true,
        procedure: true 
      },
      orderBy: { submittedAt: 'desc' },
      take: 100 // Last 100 requests
    });

    const currentYear = new Date().getFullYear();
    const patientAge = patient.birthYear ? currentYear - patient.birthYear : 45; // Default to 45 if unknown
    
    const approvedCount = patientHistory.filter(req => 
      req.decisions.some(d => d.decision === 'approved')
    ).length;

    const totalValue = patientHistory.reduce((sum, req) => {
      // Use billedAmount from claims if available, otherwise use a default
      const claimValue = req.claims?.[0]?.billedAmount;
      return sum + (claimValue ? Number(claimValue) : 0);
    }, 0);

    const recentRequests = patientHistory.filter(req => {
      const daysDiff = Math.floor(
        (Date.now() - req.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysDiff <= 30;
    });

    return {
      ageGroup: Math.min(Math.floor(patientAge / 10), 8), // 0-8 age groups
      genderEncoded: patient.gender === 'male' ? 1 : 0,
      riskCategoryScore: this.encodeRiskCategory(patient.riskCategory),
      chronicConditionCount: Array.isArray(patient.chronicConditions) ? 
        patient.chronicConditions.length : 0,
      chronicConditionComplexity: this.calculateChronicComplexity(patient.chronicConditions),
      authorizationHistoryCount: patientHistory.length,
      avgAuthorizationValue: patientHistory.length > 0 ? totalValue / patientHistory.length : 0,
      authorizationApprovalRate: patientHistory.length > 0 ? approvedCount / patientHistory.length : 0.5,
      recentActivityFrequency: recentRequests.length,
      unusualRequestPatterns: await this.calculateAnomalyScore(patient.id, patientHistory),
      providerSwitchingFrequency: this.calculateProviderSwitching(patientHistory),
      timeOfRequestPattern: this.calculateTimePattern(patientHistory)
    };
  }

  private async extractProviderFeatures(provider: any): Promise<ProviderFeatures> {
    // Get provider performance metrics
    const providerMetrics = await this.prisma.providerMetrics.findMany({
      where: { providerId: provider.id },
      orderBy: { metricDate: 'desc' },
      take: 30 // Last 30 days
    });

    const recentMetric = providerMetrics[0];
    const avgMetrics = this.calculateAverageMetrics(providerMetrics);

    // Get peer comparison data
    const peerProviders = await this.prisma.organization.findMany({
      where: { 
        type: provider.type,
        id: { not: provider.id }
      },
      include: { providerMetrics: { take: 1, orderBy: { metricDate: 'desc' } } }
    });

    return {
      approvalRate: recentMetric?.approvalRate || avgMetrics.approvalRate || 0.5,
      avgProcessingTime: recentMetric?.averageProcessingTimeHours || avgMetrics.avgProcessingTime || 24,
      qualityScore: recentMetric?.qualityScore ? Number(recentMetric.qualityScore) : 0.8,
      complianceScore: recentMetric?.complianceScore ? Number(recentMetric.complianceScore) : 0.9,
      requestVolumePercentile: this.calculatePercentile(
        recentMetric?.totalAuthorizations || 0,
        peerProviders.map(p => p.providerMetrics[0]?.totalAuthorizations || 0)
      ),
      requestValuePercentile: await this.calculateValuePercentile(provider.id),
      specialtyFocusScore: await this.calculateSpecialtyFocus(provider.id),
      fraudIncidentRate: recentMetric?.fraudIncidents || 0,
      anomalyScore: await this.calculateProviderAnomalyScore(provider.id),
      peersComparisonScore: this.calculatePeerComparison(recentMetric, peerProviders),
      referralNetworkSize: await this.calculateNetworkSize(provider.id),
      referralPatternComplexity: await this.calculateNetworkComplexity(provider.id),
      collaborationScore: await this.calculateCollaborationScore(provider.id)
    };
  }

  private async extractProcedureFeatures(procedure: any): Promise<ProcedureFeatures> {
    // Get procedure statistics from claims
    const procedureStats = await this.prisma.claim.aggregate({
      where: { procedureId: procedure.id },
      _count: { id: true },
      _avg: { 
        billedAmount: true 
      }
    });

    const allProcedureValues = await this.prisma.claim.findMany({
      where: { procedureId: procedure.id },
      select: { billedAmount: true },
      orderBy: { billedAmount: 'asc' }
    });

    return {
      complexityScore: this.calculateComplexityScore(procedure),
      requiresPreauth: procedure.requiresPreauth ? 1 : 0,
      procedureCategoryEncoded: this.encodeProcedureCategory(procedure.category),
      procedureFrequency: procedureStats._count.id,
      avgMarketValue: procedureStats._avg.billedAmount ? Number(procedureStats._avg.billedAmount) : 0,
      valuePercentile: this.calculatePercentile(
        procedureStats._avg.billedAmount ? Number(procedureStats._avg.billedAmount) : 0,
        allProcedureValues.map(p => p.billedAmount ? Number(p.billedAmount) : 0)
      ),
      proceduralRiskLevel: this.encodeRiskLevel(procedure.riskLevel),
      complicationRate: await this.calculateComplicationRate(procedure.id),
      reviewRequirementScore: await this.calculateReviewRequirement(procedure.id)
    };
  }

  private async extractTemporalFeatures(authRequest: any): Promise<TemporalFeatures> {
    const submitDate = new Date(authRequest.submittedAt);
    const now = new Date();

    return {
      dayOfWeek: submitDate.getDay(),
      monthOfYear: submitDate.getMonth(),
      hourOfDay: submitDate.getHours(),
      isWeekend: [0, 6].includes(submitDate.getDay()) ? 1 : 0,
      isHoliday: await this.isHoliday(submitDate) ? 1 : 0,
      seasonalityScore: await this.calculateSeasonalityScore(submitDate, authRequest.procedureId),
      trendScore: await this.calculateTrendScore(authRequest.procedureId),
      timeToDeadline: authRequest.dueDate ? 
        Math.max(0, (authRequest.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60)) : 168, // Default 1 week
      urgencyLevelNormalized: this.normalizeUrgencyLevel(authRequest.urgencyLevel),
      processingTimeRemaining: await this.calculateProcessingTimeRemaining(authRequest)
    };
  }

  private async extractContextualFeatures(authRequest: any): Promise<ContextualFeatures> {
    return {
      currentSystemLoad: await this.getCurrentSystemLoad(),
      reviewerAvailability: await this.getReviewerAvailability(),
      monthlyBudgetUtilization: await this.getBudgetUtilization(),
      costPressureIndicator: await this.getCostPressureIndicator(),
      recentPolicyChanges: await this.getRecentPolicyChanges(),
      complianceRiskLevel: await this.getComplianceRiskLevel(authRequest),
      documentQualityScore: await this.assessDocumentQuality(authRequest),
      justificationClarity: await this.assessJustificationClarity(authRequest.clinicalJustification),
      supportingEvidenceScore: await this.assessSupportingEvidence(authRequest.supportingDocuments)
    };
  }

  // Helper methods for feature calculations
  private encodeRiskCategory(riskCategory: string): number {
    const mapping: Record<string, number> = { 'low': 0.25, 'medium': 0.5, 'high': 0.75, 'critical': 1.0 };
    return mapping[riskCategory] || 0.5;
  }

  private calculateChronicComplexity(conditions: any[]): number {
    if (!Array.isArray(conditions)) return 0;
    
    // Weight different conditions by complexity
    const complexityWeights: Record<string, number> = {
      'diabetes': 0.8,
      'heart_disease': 0.9,
      'cancer': 1.0,
      'kidney_disease': 0.85,
      'mental_health': 0.6,
      'default': 0.5
    };

    return conditions.reduce((sum, condition: any) => {
      const weight = complexityWeights[condition.type] || complexityWeights.default;
      return sum + weight;
    }, 0);
  }

  private async calculateAnomalyScore(patientId: string, history: any[]): Promise<number> {
    // Implement statistical anomaly detection
    if (history.length < 3) return 0;

    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      const diff = history[i-1].submittedAt.getTime() - history[i].submittedAt.getTime();
      intervals.push(diff / (1000 * 60 * 60 * 24)); // Days
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Check if most recent interval is anomalous
    const recentInterval = intervals[0];
    const zScore = Math.abs((recentInterval - mean) / stdDev);
    
    return Math.min(1, zScore / 3); // Normalize to 0-1
  }

  private calculateProviderSwitching(history: any[]): number {
    if (history.length < 2) return 0;
    
    const uniqueProviders = new Set(history.map(h => h.requestingProviderId));
    return Math.min(1, uniqueProviders.size / history.length);
  }

  private calculateTimePattern(history: any[]): number {
    if (history.length < 5) return 0.5;

    const hours = history.map(h => new Date(h.submittedAt).getHours());
    const hourCounts = new Array(24).fill(0);
    hours.forEach(hour => hourCounts[hour]++);

    // Calculate entropy to measure time pattern consistency
    const total = hours.length;
    const entropy = hourCounts.reduce((ent, count) => {
      if (count === 0) return ent;
      const p = count / total;
      return ent - p * Math.log2(p);
    }, 0);

    return entropy / Math.log2(24); // Normalize
  }

  private calculatePercentile(value: number, dataset: number[]): number {
    if (dataset.length === 0) return 0.5;
    
    const sorted = dataset.sort((a, b) => a - b);
    const belowCount = sorted.filter(v => v < value).length;
    
    return belowCount / sorted.length;
  }

  // Additional helper methods would be implemented here...
  private async calculateValuePercentile(providerId: string): Promise<number> {
    // Implementation for value percentile calculation
    return 0.5; // Placeholder
  }

  private async calculateSpecialtyFocus(providerId: string): Promise<number> {
    // Implementation for specialty focus calculation
    return 0.7; // Placeholder
  }

  private async calculateProviderAnomalyScore(providerId: string): Promise<number> {
    // Implementation for provider anomaly detection
    return 0.1; // Placeholder
  }

  private calculatePeerComparison(metric: any, peers: any[]): number {
    // Implementation for peer comparison
    return 0.5; // Placeholder
  }

  private async calculateNetworkSize(providerId: string): Promise<number> {
    // Implementation for network analysis
    return 10; // Placeholder
  }

  private async calculateNetworkComplexity(providerId: string): Promise<number> {
    // Implementation for network complexity
    return 0.5; // Placeholder
  }

  private async calculateCollaborationScore(providerId: string): Promise<number> {
    // Implementation for collaboration scoring
    return 0.8; // Placeholder
  }

  private calculateComplexityScore(procedure: any): number {
    let score = 0;
    
    if (procedure.typicalDurationMinutes) {
      score += Math.min(1, procedure.typicalDurationMinutes / 240); // Normalize by 4 hours
    }
    
    score += this.encodeRiskLevel(procedure.riskLevel);
    
    return score / 2; // Average of duration and risk
  }

  private encodeProcedureCategory(category: string): number {
    const categories = ['surgical', 'diagnostic', 'therapeutic', 'preventive', 'emergency'];
    const index = categories.indexOf(category.toLowerCase());
    return index >= 0 ? index / (categories.length - 1) : 0.5;
  }

  private encodeRiskLevel(riskLevel: string): number {
    const mapping: Record<string, number> = { 'low': 0.33, 'medium': 0.67, 'high': 1.0 };
    return mapping[riskLevel] || 0.5;
  }

  private async calculateComplicationRate(procedureId: string): Promise<number> {
    // This would query historical data to calculate complication rates
    return 0.05; // Placeholder: 5% complication rate
  }

  private async calculateReviewRequirement(procedureId: string): Promise<number> {
    // Calculate likelihood of requiring manual review
    return 0.3; // Placeholder
  }

  private async isHoliday(date: Date): Promise<boolean> {
    // Implementation for holiday detection (Brazilian holidays)
    const holidays = [
      '01-01', '04-21', '09-07', '10-12', '11-02', '11-15', '12-25'
    ];
    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return holidays.includes(monthDay);
  }

  private async calculateSeasonalityScore(date: Date, procedureId: string): Promise<number> {
    // Calculate seasonal patterns for procedure types
    return 0.5; // Placeholder
  }

  private async calculateTrendScore(procedureId: string): Promise<number> {
    // Calculate recent trend in similar procedures
    return 0.6; // Placeholder
  }

  private normalizeUrgencyLevel(urgencyLevel: string): number {
    const mapping: Record<string, number> = { 'routine': 0.33, 'urgent': 0.67, 'emergency': 1.0 };
    return mapping[urgencyLevel] || 0.33;
  }

  private async calculateProcessingTimeRemaining(authRequest: any): Promise<number> {
    // Calculate expected remaining processing time
    return 24; // Placeholder: 24 hours
  }

  private async getCurrentSystemLoad(): Promise<number> {
    const pendingCount = await this.prisma.authorizationRequest.count({
      where: { status: 'pending' }
    });
    
    return Math.min(1, pendingCount / 1000); // Normalize by expected max load
  }

  private async getReviewerAvailability(): Promise<number> {
    const activeReviewers = await this.prisma.user.count({
      where: { 
        isActive: true,
        role: { in: ['auditor', 'reviewer', 'medical_director'] }
      }
    });
    
    return Math.min(1, activeReviewers / 10); // Normalize by expected reviewer count
  }

  private async getBudgetUtilization(): Promise<number> {
    // Calculate monthly budget utilization
    return 0.7; // Placeholder: 70% utilized
  }

  private async getCostPressureIndicator(): Promise<number> {
    // Calculate cost pressure based on recent trends
    return 0.4; // Placeholder
  }

  private async getRecentPolicyChanges(): Promise<number> {
    // Score impact of recent policy changes
    return 0.2; // Placeholder
  }

  private async getComplianceRiskLevel(authRequest: any): Promise<number> {
    // Assess compliance risk level
    return 0.1; // Placeholder: low risk
  }

  private async assessDocumentQuality(authRequest: any): Promise<number> {
    // Assess quality and completeness of supporting documents
    const docCount = Array.isArray(authRequest.supportingDocuments) ? 
      authRequest.supportingDocuments.length : 0;
    
    return Math.min(1, docCount / 3); // Normalize by expected document count
  }

  private async assessJustificationClarity(justification: string): Promise<number> {
    // NLP-based assessment of justification clarity
    if (!justification) return 0;
    
    const wordCount = justification.split(' ').length;
    const sentenceCount = justification.split('.').length;
    
    // Simple metrics: word count and sentence structure
    const lengthScore = Math.min(1, wordCount / 100);
    const structureScore = Math.min(1, sentenceCount / 5);
    
    return (lengthScore + structureScore) / 2;
  }

  private async assessSupportingEvidence(documents: any[]): Promise<number> {
    if (!Array.isArray(documents)) return 0;
    
    // Score based on document types and completeness
    const requiredTypes = ['medical_history', 'lab_results', 'imaging', 'clinical_notes'];
    const presentTypes = documents.map(doc => doc.type);
    const coverage = requiredTypes.filter(type => presentTypes.includes(type)).length;
    
    return coverage / requiredTypes.length;
  }

  private calculateAverageMetrics(metrics: any[]): any {
    if (metrics.length === 0) {
      return {
        approvalRate: 0.5,
        avgProcessingTime: 24,
        qualityScore: 0.8,
        complianceScore: 0.9
      };
    }

    return {
      approvalRate: metrics.reduce((sum, m) => sum + (Number(m.approvalRate) || 0), 0) / metrics.length,
      avgProcessingTime: metrics.reduce((sum, m) => sum + (Number(m.averageProcessingTimeHours) || 0), 0) / metrics.length,
      qualityScore: metrics.reduce((sum, m) => sum + (Number(m.qualityScore) || 0), 0) / metrics.length,
      complianceScore: metrics.reduce((sum, m) => sum + (Number(m.complianceScore) || 0), 0) / metrics.length
    };
  }
}

export const featureEngineeringService = new FeatureEngineeringService();