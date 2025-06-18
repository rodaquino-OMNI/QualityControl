import { Router, Request, Response, NextFunction } from 'express';
import { body, param, validationResult } from 'express-validator';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { authenticate, authorize } from '../middleware/auth';
import { aiService } from '../services/ai.service';

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
  async (req: Request, res: Response, next: NextFunction) => {
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
          documents: true,
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Check cache for existing analysis
      if (!forceReanalysis) {
        const cachedAnalysis = await cache.get(`ai:analysis:${caseId}:${analysisType}`);
        if (cachedAnalysis) {
          return res.json({
            success: true,
            data: { analysis: cachedAnalysis },
            meta: { cached: true },
          });
        }
      }

      // Perform AI analysis
      const analysis = await aiService.analyzeCase(caseData, analysisType);

      // Store analysis in database
      const savedAnalysis = await prisma.aiAnalysis.create({
        data: {
          caseId,
          analysisType,
          recommendation: analysis.recommendation,
          confidence: analysis.confidence,
          explanation: analysis.explanation,
          riskFactors: analysis.riskFactors,
          similarCases: analysis.similarCases,
          medicalContext: analysis.medicalContext,
          modelVersion: analysis.modelVersion,
          processingTime: analysis.processingTime,
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
          aiScore: analysis.confidence,
          fraudScore: analysis.riskFactors.find(f => f.factor === 'fraud')?.score || 0,
        },
      });

      logger.logAudit('ai.analysis.completed', req.user!.id, {
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
  async (req: Request, res: Response, next: NextFunction) => {
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
          aiAnalyses: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Get or create conversation
      let conversation;
      if (conversationId) {
        conversation = await prisma.aiConversation.findUnique({
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
        conversation = await prisma.aiConversation.create({
          data: {
            caseId,
            userId: req.user!.id,
          },
          include: {
            messages: true,
          },
        });
      }

      // Get AI response
      const aiResponse = await aiService.chat({
        message,
        caseContext: caseData,
        conversationHistory: conversation.messages,
      });

      // Save message and response
      await prisma.aiMessage.createMany({
        data: [
          {
            conversationId: conversation.id,
            role: 'user',
            content: message,
          },
          {
            conversationId: conversation.id,
            role: 'assistant',
            content: aiResponse.response,
            confidence: aiResponse.confidence,
          },
        ],
      });

      logger.logAudit('ai.chat.message', req.user!.id, {
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
  async (req: Request, res: Response, next: NextFunction) => {
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

      // Run fraud detection
      const fraudResult = await aiService.detectFraud(caseData);

      // Save fraud detection result
      await prisma.fraudDetection.create({
        data: {
          caseId,
          score: fraudResult.fraudScore,
          riskLevel: fraudResult.riskLevel,
          indicators: fraudResult.indicators,
          modelVersion: fraudResult.modelVersion,
        },
      });

      // Update case fraud score
      await prisma.case.update({
        where: { id: caseId },
        data: {
          fraudScore: fraudResult.fraudScore,
        },
      });

      // If high risk, create alert
      if (fraudResult.riskLevel === 'high' || fraudResult.riskLevel === 'critical') {
        await prisma.alert.create({
          data: {
            type: 'fraud_detection',
            severity: fraudResult.riskLevel,
            title: `High fraud risk detected for case ${caseId}`,
            description: `Fraud score: ${fraudResult.fraudScore}. ${fraudResult.indicators.length} risk indicators found.`,
            metadata: {
              caseId,
              fraudScore: fraudResult.fraudScore,
              indicators: fraudResult.indicators,
            },
          },
        });
      }

      logger.logAudit('ai.fraud.detection', req.user!.id, {
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
    body('limit').optional().isInt({ min: 1, max: 20 }).toInt(),
  ],
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors.array());
      }

      const { caseId } = req.params;
      const { limit = 5 } = req.query;

      // Get case data
      const caseData = await prisma.case.findUnique({
        where: { id: caseId },
      });

      if (!caseData) {
        throw new AppError('Case not found', 404, 'CASE_NOT_FOUND');
      }

      // Find similar cases
      const similarCases = await aiService.findSimilarCases(caseData, limit as number);

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