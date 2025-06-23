import { Router, Request, Response, NextFunction } from 'express';
const { body, param, query, validationResult } = require('express-validator');
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { aiService } from '../services/ai.service';
import { EntityType, NotificationType, NotificationPriority } from '@prisma/client';
import { toNumber } from '../types/database.types';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /ai/analyze/{caseId}:
 *   post:
 *     summary: Request AI analysis for a case
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               forceReanalysis:
 *                 type: boolean
 *                 default: false
 *               analysisType:
 *                 type: string
 *                 enum: [full, quick, fraud_only, medical_only]
 *                 default: full
 *     responses:
 *       200:
 *         description: AI analysis result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     analysis:
 *                       $ref: '#/components/schemas/AIAnalysis'
 *       404:
 *         description: Case not found
 */
router.post(
  '/analyze/:caseId',
  [
    param('caseId').isUUID(),
    body('forceReanalysis').optional().isBoolean(),
    body('analysisType').optional().isIn(['full', 'quick', 'fraud_only', 'medical_only']),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { caseId } = req.params;
      const { forceReanalysis = false, analysisType = 'full' } = req.body;

      // Check if case exists
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
          patient: true,
          attachments: true,
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Check cache for existing analysis
      if (!forceReanalysis) {
        const cachedAnalysis = await cache.get(`ai:analysis:${caseId}:${analysisType}`);
        if (cachedAnalysis) {
          res.json({
            success: true,
            data: { analysis: cachedAnalysis },
            meta: { cached: true },
          });
          return;
        }
      }

      // Transform case data to match CaseData interface expected by AI service
      const caseDataForAI = {
        id: caseData.id,
        procedureCode: caseData.procedureCode || '',
        procedureDescription: caseData.procedureDescription || '',
        value: toNumber(caseData.value, 0),
        patient: {
          id: caseData.patient?.id || '',
          age: caseData.patient?.birthYear ? new Date().getFullYear() - caseData.patient.birthYear : undefined,
          gender: caseData.patient?.gender || undefined,
          medicalHistory: (caseData.patient?.metadata as any)?.medicalHistory || {},
        },
        documents: caseData.attachments?.map(att => ({
          id: att.id,
          type: att.fileType || 'unknown',
          url: att.url || undefined,
        })) || [],
      };

      // Perform AI analysis
      const analysis = await aiService.analyzeCase(caseDataForAI, analysisType);

      // Store analysis in database
      const savedAnalysis = await prisma.aIAnalysis.create({
        data: {
          entityType: 'case', // Use lowercase as string, not enum
          entityId: caseId,
          analysisType,
          result: {
            recommendation: analysis.recommendation,
            confidence: analysis.confidence,
            explanation: analysis.explanation,
            riskFactors: analysis.riskFactors,
            similarCases: analysis.similarCases,
            medicalContext: analysis.medicalContext,
            modelVersion: analysis.modelVersion,
            processingTime: analysis.processingTime,
          },
          confidence: analysis.confidence,
        },
      });

      // Cache the analysis
      await cache.set(
        `ai:analysis:${caseId}:${analysisType}`,
        savedAnalysis,
        3600 // 1 hour
      );

      // Update case with AI scores
      await prisma.case.update({
        where: { id: caseId },
        data: {
          metadata: {
            ...caseData.metadata as object,
            aiScore: analysis.confidence,
            fraudScore: analysis.riskFactors.find(f => f.factor === 'fraud')?.score || 0,
          },
        },
      });

      logger.info('ai.analysis.completed', {
        userId: req.user!.id,
        caseId,
        analysisType,
        recommendation: analysis.recommendation,
        confidence: analysis.confidence,
      });

      res.json({
        success: true,
        data: { analysis: savedAnalysis },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /ai/chat:
 *   post:
 *     summary: Chat with AI assistant
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - caseId
 *             properties:
 *               message:
 *                 type: string
 *               caseId:
 *                 type: string
 *                 format: uuid
 *               conversationId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: AI chat response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                     conversationId:
 *                       type: string
 *                     confidence:
 *                       type: number
 *                     sources:
 *                       type: array
 *                       items:
 *                         type: string
 */
router.post(
  '/chat',
  [
    body('message').notEmpty().trim(),
    body('caseId').isUUID(),
    body('conversationId').optional().isUUID(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { message, caseId, conversationId } = req.body;

      // Get case context
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
          patient: true,
        },
      });
      
      // Get latest AI analysis for this case
      const latestAnalysis = await prisma.aIAnalysis.findFirst({
        where: {
          entityType: 'case', // Use lowercase as string
          entityId: caseId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await prisma.aIConversation.findUnique({
          where: { id: conversationId },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 10, // Last 10 messages for context
            },
          },
        });
      }

      if (!conversation) {
        conversation = await prisma.aIConversation.create({
          data: {
            userId: req.user!.id,
            context: {
              caseId, // Store caseId in context field as JSON
            },
          },
          include: {
            messages: true,
          },
        });
      }

      // Transform case data for chat context
      const caseContext = {
        id: caseData.id,
        procedureCode: caseData.procedureCode || '',
        procedureDescription: caseData.procedureDescription || '',
        value: toNumber(caseData.value, 0),
        patient: {
          id: caseData.patient?.id || '',
          age: caseData.patient?.birthYear ? new Date().getFullYear() - caseData.patient.birthYear : undefined,
          gender: caseData.patient?.gender || undefined,
          medicalHistory: (caseData.patient?.metadata as any)?.medicalHistory || {},
        },
      };

      // Get AI response
      const aiResponse = await aiService.chat({
        message,
        caseContext,
        conversationHistory: conversation?.messages?.map(msg => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })) || [],
      });

      // Save message and response
      await prisma.aIMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            role: 'user',
            content: message,
            metadata: {}, // Required field
          },
          {
            conversationId: conversation.id,
            role: 'assistant',
            content: aiResponse.response,
            metadata: {
              confidence: aiResponse.confidence, // Store confidence in metadata
            },
          },
        ],
      });

      logger.info('ai.chat.message', {
        userId: req.user!.id,
        caseId,
        conversationId: conversation.id,
        messageLength: message.length,
      });

      res.json({
        success: true,
        data: {
          response: aiResponse.response,
          conversationId: conversation.id,
          confidence: aiResponse.confidence,
          sources: aiResponse.sources,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /ai/fraud-detection/{caseId}:
 *   post:
 *     summary: Run fraud detection on a case
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Fraud detection results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     fraudScore:
 *                       type: number
 *                       minimum: 0
 *                       maximum: 1
 *                     riskLevel:
 *                       type: string
 *                       enum: [low, medium, high, critical]
 *                     indicators:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           severity:
 *                             type: string
 *                           confidence:
 *                             type: number
 */
router.post(
  '/fraud-detection/:caseId',
  authorize('admin', 'auditor'),
  [param('caseId').isUUID()],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { caseId } = req.params;

      // Get case with related data
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
          patient: {
            include: {
              cases: {
                where: {
                  createdAt: {
                    gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // Last year
                  },
                },
              },
            },
          },
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Transform case data to match CaseData interface expected by AI service
      const caseDataForAI = {
        id: caseData.id,
        procedureCode: caseData.procedureCode || '',
        procedureDescription: caseData.procedureDescription || '',
        value: toNumber(caseData.value, 0),
        patient: {
          id: caseData.patient?.id || '',
          age: caseData.patient?.birthYear ? new Date().getFullYear() - caseData.patient.birthYear : undefined,
          gender: caseData.patient?.gender || undefined,
          medicalHistory: (caseData.patient?.metadata as any)?.medicalHistory || {},
        },
      };

      // Run fraud detection
      const fraudResult = await aiService.detectFraud(caseDataForAI);

      // Save fraud detection result
      await prisma.fraudDetection.create({
        data: {
          entityType: EntityType.claim, // Use the proper enum value
          entityId: caseId,
          indicatorId: '00000000-0000-0000-0000-000000000001',
          confidenceScore: fraudResult.fraudScore,
          evidence: {
            riskLevel: fraudResult.riskLevel,
            indicators: fraudResult.indicators,
            modelVersion: fraudResult.modelVersion,
          },
        },
      });

      // Update case fraud score
      await prisma.case.update({
        where: { id: caseId },
        data: {
          metadata: {
            ...caseData.metadata as object,
            fraudScore: fraudResult.fraudScore,
          },
        },
      });

      // If high risk, create alert
      if (fraudResult.riskLevel === 'high' || fraudResult.riskLevel === 'critical') {
        await prisma.notification.create({
          data: {
            userId: req.user!.id,
            type: NotificationType.system_alert,
            priority: fraudResult.riskLevel === 'critical' ? NotificationPriority.high : NotificationPriority.medium,
            title: `High fraud risk detected for case ${caseId}`,
            message: `Fraud score: ${fraudResult.fraudScore}. ${fraudResult.indicators.length} risk indicators found.`, // Changed from description to message
            metadata: {
              caseId,
              fraudScore: fraudResult.fraudScore,
              indicators: fraudResult.indicators,
            },
          },
        });
      }

      logger.info('ai.fraud.detection', {
        userId: req.user!.id,
        caseId,
        fraudScore: fraudResult.fraudScore,
        riskLevel: fraudResult.riskLevel,
      });

      res.json({
        success: true,
        data: fraudResult,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @swagger
 * /ai/similar-cases/{caseId}:
 *   get:
 *     summary: Find similar cases using AI
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: caseId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 5
 *           minimum: 1
 *           maximum: 20
 *     responses:
 *       200:
 *         description: Similar cases found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     similarCases:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           caseId:
 *                             type: string
 *                           similarity:
 *                             type: number
 *                           decision:
 *                             type: string
 *                           procedureCode:
 *                             type: string
 *                           value:
 *                             type: number
 *                           decidedAt:
 *                             type: string
 *                             format: date-time
 */
router.get(
  '/similar-cases/:caseId',
  [
    param('caseId').isUUID(),
    query('limit').optional().isInt({ min: 1, max: 20 }).toInt(),
  ],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { caseId } = req.params;
      const { limit = 5 } = req.query;

      // Get case data with required fields for AI service
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: {
          patient: true,
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Transform case data to match CaseData interface expected by AI service
      const caseDataForAI = {
        id: caseData.id,
        procedureCode: caseData.procedureCode || '',
        procedureDescription: caseData.procedureDescription || '',
        value: toNumber(caseData.value, 0),
        patient: {
          id: caseData.patient?.id || '',
          age: caseData.patient?.birthYear ? new Date().getFullYear() - caseData.patient.birthYear : undefined,
          gender: caseData.patient?.gender || undefined,
          medicalHistory: (caseData.patient?.metadata as any)?.medicalHistory || {},
        },
      };

      // Find similar cases
      const similarCases = await aiService.findSimilarCases(caseDataForAI, limit as number);

      res.json({
        success: true,
        data: { similarCases },
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as aiRoutes };