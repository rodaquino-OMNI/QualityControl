import axios from 'axios';
import { logger } from '../utils/logger';
import { cache } from '../config/redis';

interface CaseData {
  id: string;
  procedureCode: string;
  procedureDescription: string;
  value: number;
  patient: {
    id: string;
    age?: number;
    gender?: string;
    medicalHistory?: any;
  };
  documents?: any[];
}

interface AIAnalysisResult {
  recommendation: 'approved' | 'denied' | 'partial' | 'review';
  confidence: number;
  explanation: string;
  riskFactors: Array<{
    factor: string;
    score: number;
    description: string;
  }>;
  similarCases: Array<{
    caseId: string;
    similarity: number;
    decision: string;
  }>;
  medicalContext: {
    guidelines: string[];
    protocols: string[];
    evidence: string[];
  };
  modelVersion: string;
  processingTime: number;
}

interface ChatResponse {
  response: string;
  confidence: number;
  sources: string[];
}

interface FraudDetectionResult {
  fraudScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  indicators: Array<{
    type: string;
    description: string;
    severity: string;
    confidence: number;
  }>;
  modelVersion: string;
}

class AIService {
  private aiServiceUrl: string;
  private openaiApiKey: string;
  private openaiModel: string;

  constructor() {
    this.aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    this.openaiApiKey = process.env.OPENAI_API_KEY || '';
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';
  }

  async analyzeCase(
    caseData: CaseData,
    analysisType: 'full' | 'quick' | 'fraud_only' | 'medical_only' = 'full'
  ): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    try {
      // Call AI service
      const response = await axios.post(
        `${this.aiServiceUrl}/analyze`,
        {
          case: caseData,
          analysisType,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.AI_SERVICE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 seconds
        }
      );

      const result = response.data;

      // Enhance with OpenAI analysis if needed
      if (analysisType === 'full' && result.confidence < 0.8) {
        const enhancedAnalysis = await this.enhanceWithGPT4(caseData, result);
        result.explanation = enhancedAnalysis.explanation || result.explanation;
        result.medicalContext = {
          ...result.medicalContext,
          ...enhancedAnalysis.context,
        };
      }

      return {
        ...result,
        modelVersion: `${result.modelVersion}-${this.openaiModel}`,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('AI analysis failed:', error);
      
      // Fallback to rule-based analysis
      return this.fallbackAnalysis(caseData);
    }
  }

  async chat(params: {
    message: string;
    caseContext: any;
    conversationHistory: any[];
  }): Promise<ChatResponse> {
    try {
      // Prepare context
      const systemPrompt = this.buildSystemPrompt(params.caseContext);
      const messages = [
        { role: 'system', content: systemPrompt },
        ...params.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        { role: 'user', content: params.message },
      ];

      // Call OpenAI
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.openaiModel,
          messages,
          temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.3'),
          max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2000'),
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const aiResponse = response.data.choices[0].message.content;

      // Extract sources and confidence
      const sources = this.extractSources(aiResponse);
      const confidence = this.calculateConfidence(aiResponse, params.caseContext);

      return {
        response: aiResponse,
        confidence,
        sources,
      };
    } catch (error) {
      logger.error('Chat failed:', error);
      throw error;
    }
  }

  async detectFraud(caseData: any): Promise<FraudDetectionResult> {
    try {
      // Call fraud detection service
      const response = await axios.post(
        `${this.aiServiceUrl}/fraud-detection`,
        {
          case: caseData,
          patientHistory: caseData.patient.cases || [],
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.AI_SERVICE_API_KEY}`,
          },
          timeout: 20000,
        }
      );

      const result = response.data;

      // Determine risk level
      const riskLevel = this.calculateRiskLevel(result.fraudScore);

      return {
        fraudScore: result.fraudScore,
        riskLevel,
        indicators: result.indicators || [],
        modelVersion: result.modelVersion || '1.0.0',
      };
    } catch (error) {
      logger.error('Fraud detection failed:', error);
      
      // Return low risk by default
      return {
        fraudScore: 0.1,
        riskLevel: 'low',
        indicators: [],
        modelVersion: 'fallback',
      };
    }
  }

  async findSimilarCases(caseData: any, limit: number = 5): Promise<any[]> {
    try {
      // Check cache first
      const cacheKey = `similar:${caseData.procedureCode}:${caseData.value}`;
      const cached = await cache.get(cacheKey);
      if (cached) {
        return (cached as any[]).slice(0, limit);
      }

      // Call similarity search service
      const response = await axios.post(
        `${this.aiServiceUrl}/similar-cases`,
        {
          case: caseData,
          limit: limit * 2, // Get more to filter
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.AI_SERVICE_API_KEY}`,
          },
        }
      );

      const similarCases = response.data.cases || [];

      // Cache results
      await cache.set(cacheKey, similarCases, 3600); // 1 hour

      return similarCases.slice(0, limit);
    } catch (error) {
      logger.error('Similar cases search failed:', error);
      return [];
    }
  }

  private async enhanceWithGPT4(caseData: CaseData, initialAnalysis: any): Promise<any> {
    try {
      const prompt = `
        Medical Case Analysis Enhancement:
        
        Procedure: ${caseData.procedureCode} - ${caseData.procedureDescription}
        Value: R$ ${caseData.value}
        Patient Age: ${caseData.patient.age || 'Unknown'}
        
        Initial AI Analysis:
        - Recommendation: ${initialAnalysis.recommendation}
        - Confidence: ${initialAnalysis.confidence}
        
        Please provide:
        1. A detailed medical justification for the recommendation
        2. Relevant clinical guidelines
        3. Any additional risk factors to consider
        4. Alternative recommendations if confidence is low
      `;

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.openaiModel,
          messages: [
            {
              role: 'system',
              content: 'You are a medical audit expert assistant. Provide detailed analysis based on Brazilian healthcare guidelines and best practices.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;

      return {
        explanation: content,
        context: {
          guidelines: this.extractGuidelines(content),
          protocols: [],
          evidence: [],
        },
      };
    } catch (error) {
      logger.error('GPT-4 enhancement failed:', error);
      return { explanation: initialAnalysis.explanation, context: {} };
    }
  }

  private buildSystemPrompt(caseContext: any): string {
    return `You are an AI medical audit assistant for AUSTA Cockpit. You help auditors make informed decisions about medical authorization requests.

Current Case Context:
- Procedure: ${caseContext.procedureCode} - ${caseContext.procedureDescription}
- Patient ID: ${caseContext.patientId}
- Value: R$ ${caseContext.value}
- Priority: ${caseContext.priority}
- Current Status: ${caseContext.status}

Guidelines:
1. Always consider patient safety and medical necessity
2. Follow ANS (Agência Nacional de Saúde Suplementar) regulations
3. Be objective and evidence-based in your responses
4. Cite relevant medical guidelines when applicable
5. Consider cost-effectiveness without compromising care quality

Previous AI Analysis:
${caseContext.aiAnalyses?.[0] ? `
- Recommendation: ${caseContext.aiAnalyses[0].recommendation}
- Confidence: ${caseContext.aiAnalyses[0].confidence}
- Key factors: ${caseContext.aiAnalyses[0].explanation}
` : 'No previous analysis available'}

Please provide helpful, accurate, and medically sound advice.`;
  }

  private extractSources(content: string): string[] {
    const sources: string[] = [];
    
    // Extract guideline references
    const guidelineMatches = content.match(/(?:guideline|protocol|standard):\s*([^\n,]+)/gi);
    if (guidelineMatches) {
      sources.push(...guidelineMatches);
    }

    // Extract specific regulation references
    const regulationMatches = content.match(/(?:ANS|CFM|resolution)\s*[\d\/\-]+/gi);
    if (regulationMatches) {
      sources.push(...regulationMatches);
    }

    return [...new Set(sources)]; // Remove duplicates
  }

  private extractGuidelines(content: string): string[] {
    const guidelines: string[] = [];
    const lines = content.split('\n');
    
    lines.forEach(line => {
      if (line.toLowerCase().includes('guideline') || 
          line.toLowerCase().includes('protocol') ||
          line.toLowerCase().includes('standard')) {
        guidelines.push(line.trim());
      }
    });

    return guidelines.slice(0, 5); // Return top 5
  }

  private calculateConfidence(response: string, context: any): number {
    // Simple confidence calculation based on response characteristics
    let confidence = 0.7; // Base confidence

    // Increase confidence if response cites specific guidelines
    if (response.match(/(?:guideline|protocol|ANS|CFM)/i)) {
      confidence += 0.1;
    }

    // Increase confidence if response is detailed
    if (response.length > 500) {
      confidence += 0.1;
    }

    // Decrease confidence for uncertain language
    if (response.match(/(?:might|maybe|possibly|unclear|depends)/i)) {
      confidence -= 0.2;
    }

    return Math.max(0.3, Math.min(1.0, confidence));
  }

  private calculateRiskLevel(fraudScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (fraudScore >= 0.9) return 'critical';
    if (fraudScore >= 0.7) return 'high';
    if (fraudScore >= 0.4) return 'medium';
    return 'low';
  }

  private fallbackAnalysis(caseData: CaseData): AIAnalysisResult {
    // Simple rule-based fallback
    let recommendation: 'approved' | 'denied' | 'partial' | 'review' = 'review';
    let confidence = 0.5;
    const riskFactors = [];

    // High value cases need review
    if (caseData.value > 50000) {
      riskFactors.push({
        factor: 'high_value',
        score: 0.8,
        description: 'High-value procedure requires detailed review',
      });
    }

    // Emergency procedures likely approved
    if (caseData.procedureDescription.toLowerCase().includes('emergency')) {
      recommendation = 'approved';
      confidence = 0.9;
    }

    return {
      recommendation,
      confidence,
      explanation: 'Fallback analysis due to AI service unavailability. Manual review recommended.',
      riskFactors,
      similarCases: [],
      medicalContext: {
        guidelines: ['Manual review required'],
        protocols: [],
        evidence: [],
      },
      modelVersion: 'fallback-1.0',
      processingTime: 100,
    };
  }
}

export const aiService = new AIService();