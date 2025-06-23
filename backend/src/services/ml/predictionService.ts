import axios from 'axios';
import { logger } from '../../utils/logger';
import { featureEngineeringService } from './featureEngineering.service';
import { PrismaClient, AIModelType } from '@prisma/client';
import { cache } from '../../config/redis';

export interface PredictionRequest {
  authorizationRequestId: string;
  modelType: 'authorization' | 'fraud' | 'risk_assessment' | 'cost_prediction';
  requestFastTrack?: boolean;
}

export interface AuthorizationPrediction {
  recommendation: 'approved' | 'denied' | 'requires_review' | 'partial_approval';
  confidence: number; // 0-1
  riskScore: number; // 0-1
  explanation: ExplanationDetails;
  predictedProcessingTime: number; // hours
  suggestedReviewer?: string;
  alternativeRecommendations?: AlternativeRecommendation[];
}

export interface FraudPrediction {
  fraudProbability: number; // 0-1
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  flaggedIndicators: FraudIndicator[];
  investigationPriority: number; // 1-10
  explanation: ExplanationDetails;
  similarFraudCases: SimilarCase[];
}

export interface RiskAssessment {
  clinicalRisk: number; // 0-1
  financialRisk: number; // 0-1
  complianceRisk: number; // 0-1
  overallRisk: number; // 0-1
  riskFactors: RiskFactor[];
  mitigationSuggestions: string[];
  explanation: ExplanationDetails;
}

export interface CostPrediction {
  predictedCost: number;
  costRange: { min: number; max: number };
  costDrivers: CostDriver[];
  benchmarkComparison: BenchmarkData;
  costOptimizationSuggestions: string[];
}

interface ExplanationDetails {
  primaryFactors: FactorExplanation[];
  modelVersion: string;
  featureImportance: { [key: string]: number };
  confidenceBreakdown: ConfidenceBreakdown;
  decisionBoundary: DecisionBoundaryInfo;
}

interface FactorExplanation {
  factor: string;
  impact: number; // -1 to 1 (negative to positive impact)
  description: string;
  category: 'patient' | 'provider' | 'procedure' | 'temporal' | 'contextual';
}

interface ConfidenceBreakdown {
  dataQuality: number;
  modelCertainty: number;
  featureReliability: number;
  historicalAccuracy: number;
}

interface DecisionBoundaryInfo {
  threshold: number;
  marginToThreshold: number;
  sensitivity: number;
  specificity: number;
}

interface AlternativeRecommendation {
  recommendation: string;
  confidence: number;
  requiredConditions: string[];
  costImpact: number;
}

interface FraudIndicator {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  historicalOccurrence: number;
}

interface SimilarCase {
  caseId: string;
  similarity: number;
  outcome: string;
  timeToResolution: number;
}

interface RiskFactor {
  category: string;
  factor: string;
  contribution: number;
  description: string;
  mitigationLevel: 'low' | 'medium' | 'high';
}

interface CostDriver {
  component: string;
  contribution: number;
  variance: number;
  controllable: boolean;
}

interface BenchmarkData {
  percentile: number;
  peerAverage: number;
  marketRange: { min: number; max: number };
  historicalTrend: 'increasing' | 'decreasing' | 'stable';
}

export class MLPredictionService {
  private prisma: PrismaClient;
  private mlServiceUrl: string;
  private modelVersions: Map<string, string> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';
    this.initializeModelVersions();
  }

  private async initializeModelVersions() {
    try {
      // Get latest model versions from database
      const models = await this.prisma.aIModel.findMany({
        where: { status: 'active' },
        select: { type: true, version: true, name: true }
      });

      models.forEach(model => {
        this.modelVersions.set(model.type, `${model.name}:${model.version}`);
      });

      logger.info('ML model versions initialized', { versions: Object.fromEntries(this.modelVersions) });
    } catch (error) {
      logger.error('Failed to initialize model versions:', error);
      // Set default versions
      this.modelVersions.set('authorization', 'auth-model:v2.1');
      this.modelVersions.set('fraud_detection', 'fraud-model:v1.8');
      this.modelVersions.set('risk_assessment', 'risk-model:v1.5');
      this.modelVersions.set('pattern_analysis', 'cost-model:v1.2');
    }
  }

  async predictAuthorization(request: PredictionRequest): Promise<AuthorizationPrediction> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `auth_prediction:${request.authorizationRequestId}`;
      const cached = await cache.get(cacheKey);
      if (cached && !request.requestFastTrack) {
        return JSON.parse(cached as string);
      }

      // Extract features
      const features = await featureEngineeringService.extractFeatureVector(request.authorizationRequestId);
      
      // Prepare prediction request
      const predictionPayload = {
        features,
        model_type: 'authorization',
        model_version: this.modelVersions.get('authorization'),
        request_metadata: {
          request_id: request.authorizationRequestId,
          timestamp: new Date().toISOString(),
          fast_track: request.requestFastTrack || false
        }
      };

      // Call ML service
      const response = await axios.post(
        `${this.mlServiceUrl}/predict/authorization`,
        predictionPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ML_SERVICE_API_KEY}`,
            'X-Request-ID': request.authorizationRequestId
          },
          timeout: request.requestFastTrack ? 5000 : 15000
        }
      );

      const prediction = this.parseAuthorizationPrediction(response.data, features);
      prediction.explanation.modelVersion = this.modelVersions.get('authorization') || 'unknown';

      // Store prediction in database
      await this.storePrediction('authorization', request.authorizationRequestId, prediction);

      // Cache for 30 minutes
      await cache.set(cacheKey, prediction, 1800);

      logger.info('Authorization prediction completed', {
        requestId: request.authorizationRequestId,
        recommendation: prediction.recommendation,
        confidence: prediction.confidence,
        processingTime: Date.now() - startTime
      });

      return prediction;

    } catch (error) {
      logger.error('Authorization prediction failed:', error);
      return this.getFallbackAuthorizationPrediction(request.authorizationRequestId);
    }
  }

  async predictFraud(request: PredictionRequest): Promise<FraudPrediction> {
    const startTime = Date.now();
    
    try {
      const cacheKey = `fraud_prediction:${request.authorizationRequestId}`;
      const cached = await cache.get(cacheKey);
      if (cached && !request.requestFastTrack) {
        return JSON.parse(cached as string);
      }

      const features = await featureEngineeringService.extractFeatureVector(request.authorizationRequestId);
      
      const predictionPayload = {
        features,
        model_type: 'fraud_detection',
        model_version: this.modelVersions.get('fraud_detection'),
        request_metadata: {
          request_id: request.authorizationRequestId,
          timestamp: new Date().toISOString()
        }
      };

      const response = await axios.post(
        `${this.mlServiceUrl}/predict/fraud`,
        predictionPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ML_SERVICE_API_KEY}`
          },
          timeout: 10000
        }
      );

      const prediction = this.parseFraudPrediction(response.data, features);
      
      // Store prediction
      await this.storePrediction('fraud_detection', request.authorizationRequestId, prediction);

      // Cache for 1 hour
      await cache.set(cacheKey, prediction, 3600);

      logger.info('Fraud prediction completed', {
        requestId: request.authorizationRequestId,
        fraudProbability: prediction.fraudProbability,
        riskLevel: prediction.riskLevel,
        processingTime: Date.now() - startTime
      });

      return prediction;

    } catch (error) {
      logger.error('Fraud prediction failed:', error);
      return this.getFallbackFraudPrediction(request.authorizationRequestId);
    }
  }

  async assessRisk(request: PredictionRequest): Promise<RiskAssessment> {
    const startTime = Date.now();
    
    try {
      const cacheKey = `risk_assessment:${request.authorizationRequestId}`;
      const cached = await cache.get(cacheKey);
      if (cached && !request.requestFastTrack) {
        return JSON.parse(cached as string);
      }

      const features = await featureEngineeringService.extractFeatureVector(request.authorizationRequestId);
      
      const predictionPayload = {
        features,
        model_type: 'risk_assessment',
        model_version: this.modelVersions.get('risk_assessment'),
        request_metadata: {
          request_id: request.authorizationRequestId,
          timestamp: new Date().toISOString()
        }
      };

      const response = await axios.post(
        `${this.mlServiceUrl}/predict/risk`,
        predictionPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ML_SERVICE_API_KEY}`
          },
          timeout: 10000
        }
      );

      const assessment = this.parseRiskAssessment(response.data, features);
      
      // Store assessment
      await this.storePrediction('risk_assessment', request.authorizationRequestId, assessment);

      // Cache for 45 minutes
      await cache.set(cacheKey, assessment, 2700);

      logger.info('Risk assessment completed', {
        requestId: request.authorizationRequestId,
        overallRisk: assessment.overallRisk,
        processingTime: Date.now() - startTime
      });

      return assessment;

    } catch (error) {
      logger.error('Risk assessment failed:', error);
      return this.getFallbackRiskAssessment(request.authorizationRequestId);
    }
  }

  async predictCost(request: PredictionRequest): Promise<CostPrediction> {
    const startTime = Date.now();
    
    try {
      const cacheKey = `cost_prediction:${request.authorizationRequestId}`;
      const cached = await cache.get(cacheKey);
      if (cached && !request.requestFastTrack) {
        return JSON.parse(cached as string);
      }

      const features = await featureEngineeringService.extractFeatureVector(request.authorizationRequestId);
      
      const predictionPayload = {
        features,
        model_type: 'cost_prediction',
        model_version: this.modelVersions.get('pattern_analysis'), // Using pattern_analysis for cost
        request_metadata: {
          request_id: request.authorizationRequestId,
          timestamp: new Date().toISOString()
        }
      };

      const response = await axios.post(
        `${this.mlServiceUrl}/predict/cost`,
        predictionPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ML_SERVICE_API_KEY}`
          },
          timeout: 8000
        }
      );

      const prediction = this.parseCostPrediction(response.data, features);
      
      // Store prediction
      await this.storePrediction('pattern_analysis', request.authorizationRequestId, prediction);

      // Cache for 2 hours
      await cache.set(cacheKey, prediction, 7200);

      logger.info('Cost prediction completed', {
        requestId: request.authorizationRequestId,
        predictedCost: prediction.predictedCost,
        processingTime: Date.now() - startTime
      });

      return prediction;

    } catch (error) {
      logger.error('Cost prediction failed:', error);
      return this.getFallbackCostPrediction(request.authorizationRequestId);
    }
  }

  async getComprehensivePrediction(authorizationRequestId: string): Promise<{
    authorization: AuthorizationPrediction;
    fraud: FraudPrediction;
    risk: RiskAssessment;
    cost: CostPrediction;
  }> {
    // Run all predictions in parallel
    const [authorization, fraud, risk, cost] = await Promise.all([
      this.predictAuthorization({ authorizationRequestId, modelType: 'authorization' }),
      this.predictFraud({ authorizationRequestId, modelType: 'fraud' }),
      this.assessRisk({ authorizationRequestId, modelType: 'risk_assessment' }),
      this.predictCost({ authorizationRequestId, modelType: 'cost_prediction' })
    ]);

    return { authorization, fraud, risk, cost };
  }

  private parseAuthorizationPrediction(mlResponse: any, features: any): AuthorizationPrediction {
    return {
      recommendation: mlResponse.prediction.recommendation,
      confidence: mlResponse.prediction.confidence,
      riskScore: mlResponse.prediction.risk_score,
      predictedProcessingTime: mlResponse.prediction.processing_time_hours,
      suggestedReviewer: mlResponse.prediction.suggested_reviewer,
      alternativeRecommendations: mlResponse.prediction.alternatives || [],
      explanation: {
        primaryFactors: this.extractFactorExplanations(mlResponse.explanation.factors),
        modelVersion: mlResponse.model_info.version,
        featureImportance: mlResponse.explanation.feature_importance,
        confidenceBreakdown: mlResponse.explanation.confidence_breakdown,
        decisionBoundary: mlResponse.explanation.decision_boundary
      }
    };
  }

  private parseFraudPrediction(mlResponse: any, features: any): FraudPrediction {
    return {
      fraudProbability: mlResponse.prediction.fraud_probability,
      riskLevel: mlResponse.prediction.risk_level,
      flaggedIndicators: mlResponse.prediction.indicators,
      investigationPriority: mlResponse.prediction.priority,
      similarFraudCases: mlResponse.prediction.similar_cases || [],
      explanation: {
        primaryFactors: this.extractFactorExplanations(mlResponse.explanation.factors),
        modelVersion: mlResponse.model_info.version,
        featureImportance: mlResponse.explanation.feature_importance,
        confidenceBreakdown: mlResponse.explanation.confidence_breakdown,
        decisionBoundary: mlResponse.explanation.decision_boundary
      }
    };
  }

  private parseRiskAssessment(mlResponse: any, features: any): RiskAssessment {
    return {
      clinicalRisk: mlResponse.prediction.clinical_risk,
      financialRisk: mlResponse.prediction.financial_risk,
      complianceRisk: mlResponse.prediction.compliance_risk,
      overallRisk: mlResponse.prediction.overall_risk,
      riskFactors: mlResponse.prediction.risk_factors,
      mitigationSuggestions: mlResponse.prediction.mitigation_suggestions,
      explanation: {
        primaryFactors: this.extractFactorExplanations(mlResponse.explanation.factors),
        modelVersion: mlResponse.model_info.version,
        featureImportance: mlResponse.explanation.feature_importance,
        confidenceBreakdown: mlResponse.explanation.confidence_breakdown,
        decisionBoundary: mlResponse.explanation.decision_boundary
      }
    };
  }

  private parseCostPrediction(mlResponse: any, features: any): CostPrediction {
    return {
      predictedCost: mlResponse.prediction.predicted_cost,
      costRange: mlResponse.prediction.cost_range,
      costDrivers: mlResponse.prediction.cost_drivers,
      benchmarkComparison: mlResponse.prediction.benchmark_comparison,
      costOptimizationSuggestions: mlResponse.prediction.optimization_suggestions
    };
  }

  private extractFactorExplanations(factors: any[]): FactorExplanation[] {
    return factors.map(factor => ({
      factor: factor.name,
      impact: factor.impact,
      description: factor.description,
      category: factor.category
    }));
  }

  private async storePrediction(modelType: string, entityId: string, prediction: any) {
    try {
      await this.prisma.analysisResult.create({
        data: {
          modelId: await this.getModelId(modelType),
          entityType: 'authorization',
          entityId,
          analysisType: modelType,
          confidenceScore: this.extractConfidenceScore(prediction),
          riskScore: this.extractRiskScore(prediction),
          recommendations: [prediction],
          findings: { prediction },
          processingTimeMs: 0, // This would be calculated from timing
          analyzedAt: new Date()
        }
      });
    } catch (error) {
      logger.error('Failed to store prediction:', error);
    }
  }

  private async getModelId(modelType: string): Promise<string> {
    // Map model types to valid AIModelType enum values
    const modelTypeMap: Record<string, AIModelType> = {
      'authorization': 'authorization' as AIModelType,
      'fraud_detection': 'fraud_detection' as AIModelType,
      'risk_assessment': 'risk_assessment' as AIModelType,
      'pattern_analysis': 'pattern_analysis' as AIModelType,
      'cost_prediction': 'pattern_analysis' as AIModelType // Map cost to pattern_analysis
    };
    
    const mappedType = modelTypeMap[modelType] || ('pattern_analysis' as AIModelType);
    
    const model = await this.prisma.aIModel.findFirst({
      where: { type: mappedType, status: 'active' }
    });
    
    if (!model) {
      // Create a default model record if none exists
      const defaultModel = await this.prisma.aIModel.create({
        data: {
          name: `${modelType}-default`,
          version: '1.0',
          type: mappedType,
          status: 'active',
          configuration: {}
        }
      });
      return defaultModel.id;
    }
    
    return model.id;
  }

  private extractConfidenceScore(prediction: any): number {
    if (prediction.confidence !== undefined) return prediction.confidence;
    if (prediction.fraudProbability !== undefined) return 1 - prediction.fraudProbability;
    if (prediction.overallRisk !== undefined) return 1 - prediction.overallRisk;
    return 0.5;
  }

  private extractRiskScore(prediction: any): number {
    if (prediction.riskScore !== undefined) return prediction.riskScore;
    if (prediction.fraudProbability !== undefined) return prediction.fraudProbability;
    if (prediction.overallRisk !== undefined) return prediction.overallRisk;
    return 0.5;
  }

  // Fallback methods for when ML service is unavailable
  private async getFallbackAuthorizationPrediction(requestId: string): Promise<AuthorizationPrediction> {
    const authRequest = await this.prisma.authorizationRequest.findUnique({
      where: { id: requestId },
      include: { procedure: true, patient: true }
    });

    // Simple rule-based fallback
    let recommendation: 'approved' | 'denied' | 'requires_review' | 'partial_approval' = 'requires_review';
    let confidence = 0.5;
    let riskScore = 0.5;

    if (authRequest?.urgencyLevel === 'emergency') {
      recommendation = 'approved';
      confidence = 0.8;
      riskScore = 0.3;
    } else if (authRequest?.procedure?.requiresPreauth) {
      recommendation = 'requires_review';
      confidence = 0.9;
      riskScore = 0.6;
    }

    return {
      recommendation,
      confidence,
      riskScore,
      predictedProcessingTime: 24,
      explanation: {
        primaryFactors: [{
          factor: 'fallback_mode',
          impact: 0,
          description: 'ML service unavailable, using rule-based fallback',
          category: 'contextual'
        }],
        modelVersion: 'fallback-1.0',
        featureImportance: {},
        confidenceBreakdown: {
          dataQuality: 0.5,
          modelCertainty: 0.3,
          featureReliability: 0.5,
          historicalAccuracy: 0.5
        },
        decisionBoundary: {
          threshold: 0.5,
          marginToThreshold: 0,
          sensitivity: 0.5,
          specificity: 0.5
        }
      }
    };
  }

  private async getFallbackFraudPrediction(requestId: string): Promise<FraudPrediction> {
    return {
      fraudProbability: 0.1,
      riskLevel: 'low',
      flaggedIndicators: [],
      investigationPriority: 1,
      similarFraudCases: [],
      explanation: {
        primaryFactors: [{
          factor: 'fallback_mode',
          impact: 0,
          description: 'ML service unavailable, using conservative fraud assessment',
          category: 'contextual'
        }],
        modelVersion: 'fallback-1.0',
        featureImportance: {},
        confidenceBreakdown: {
          dataQuality: 0.5,
          modelCertainty: 0.3,
          featureReliability: 0.5,
          historicalAccuracy: 0.5
        },
        decisionBoundary: {
          threshold: 0.5,
          marginToThreshold: 0,
          sensitivity: 0.5,
          specificity: 0.5
        }
      }
    };
  }

  private async getFallbackRiskAssessment(requestId: string): Promise<RiskAssessment> {
    return {
      clinicalRisk: 0.5,
      financialRisk: 0.5,
      complianceRisk: 0.3,
      overallRisk: 0.4,
      riskFactors: [],
      mitigationSuggestions: ['Manual review recommended due to ML service unavailability'],
      explanation: {
        primaryFactors: [{
          factor: 'fallback_mode',
          impact: 0,
          description: 'ML service unavailable, using conservative risk assessment',
          category: 'contextual'
        }],
        modelVersion: 'fallback-1.0',
        featureImportance: {},
        confidenceBreakdown: {
          dataQuality: 0.5,
          modelCertainty: 0.3,
          featureReliability: 0.5,
          historicalAccuracy: 0.5
        },
        decisionBoundary: {
          threshold: 0.5,
          marginToThreshold: 0,
          sensitivity: 0.5,
          specificity: 0.5
        }
      }
    };
  }

  private async getFallbackCostPrediction(requestId: string): Promise<CostPrediction> {
    return {
      predictedCost: 0,
      costRange: { min: 0, max: 0 },
      costDrivers: [],
      benchmarkComparison: {
        percentile: 50,
        peerAverage: 0,
        marketRange: { min: 0, max: 0 },
        historicalTrend: 'stable'
      },
      costOptimizationSuggestions: ['Cost prediction unavailable due to ML service issues']
    };
  }
}

export const mlPredictionService = new MLPredictionService();