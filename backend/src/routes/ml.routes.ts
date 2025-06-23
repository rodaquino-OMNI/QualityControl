import { Router } from 'express';
import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddlewareInstance } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { mlPredictionService } from '../services/ml/predictionService';
import { logger } from '../utils/logger';
import asyncHandler from 'express-async-handler';


// Helper function to get error message
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

const router = Router();

// Apply authentication and rate limiting to all ML routes
router.use(authMiddlewareInstance.authenticate);
router.use('/predict', rateLimiter); // Rate limiting for predictions
router.use('/batch', rateLimiter); // Rate limiting for batch operations

/**
 * @swagger
 * /api/ml/predict/authorization:
 *   post:
 *     summary: Get authorization prediction for a request
 *     tags: [ML Predictions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - authorizationRequestId
 *             properties:
 *               authorizationRequestId:
 *                 type: string
 *                 format: uuid
 *               fastTrack:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Authorization prediction
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthorizationPrediction'
 */
router.post('/predict/authorization',
  [
    body('authorizationRequestId')
      .isUUID()
      .withMessage('Authorization request ID must be a valid UUID'),
    body('fastTrack')
      .optional()
      .isBoolean()
      .withMessage('Fast track must be a boolean')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { authorizationRequestId, fastTrack = false } = req.body;

    try {
      const prediction = await mlPredictionService.predictAuthorization({
        authorizationRequestId,
        modelType: 'authorization',
        requestFastTrack: fastTrack
      });

      res.json({
        success: true,
        data: prediction,
        metadata: {
          requestId: authorizationRequestId,
          timestamp: new Date().toISOString(),
          fastTrack
        }
      });

      logger.info('Authorization prediction served', {
        userId: req.user?.id,
        requestId: authorizationRequestId,
        recommendation: prediction.recommendation,
        confidence: prediction.confidence
      });

    } catch (error) {
      logger.error('Authorization prediction error:', error);
      res.status(500).json({
        success: false,
        message: 'Prediction service temporarily unavailable',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/predict/fraud:
 *   post:
 *     summary: Get fraud detection prediction
 *     tags: [ML Predictions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/predict/fraud',
  [
    body('authorizationRequestId')
      .isUUID()
      .withMessage('Authorization request ID must be a valid UUID')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { authorizationRequestId } = req.body;

    try {
      const prediction = await mlPredictionService.predictFraud({
        authorizationRequestId,
        modelType: 'fraud'
      });

      res.json({
        success: true,
        data: prediction,
        metadata: {
          requestId: authorizationRequestId,
          timestamp: new Date().toISOString()
        }
      });

      logger.info('Fraud prediction served', {
        userId: req.user?.id,
        requestId: authorizationRequestId,
        fraudProbability: prediction.fraudProbability,
        riskLevel: prediction.riskLevel
      });

    } catch (error) {
      logger.error('Fraud prediction error:', error);
      res.status(500).json({
        success: false,
        message: 'Fraud detection service temporarily unavailable',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/predict/risk:
 *   post:
 *     summary: Get comprehensive risk assessment
 *     tags: [ML Predictions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/predict/risk',
  [
    body('authorizationRequestId')
      .isUUID()
      .withMessage('Authorization request ID must be a valid UUID')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { authorizationRequestId } = req.body;

    try {
      const assessment = await mlPredictionService.assessRisk({
        authorizationRequestId,
        modelType: 'risk_assessment'
      });

      res.json({
        success: true,
        data: assessment,
        metadata: {
          requestId: authorizationRequestId,
          timestamp: new Date().toISOString()
        }
      });

      logger.info('Risk assessment served', {
        userId: req.user?.id,
        requestId: authorizationRequestId,
        overallRisk: assessment.overallRisk
      });

    } catch (error) {
      logger.error('Risk assessment error:', error);
      res.status(500).json({
        success: false,
        message: 'Risk assessment service temporarily unavailable',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/predict/cost:
 *   post:
 *     summary: Get cost prediction for authorization
 *     tags: [ML Predictions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/predict/cost',
  [
    body('authorizationRequestId')
      .isUUID()
      .withMessage('Authorization request ID must be a valid UUID')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { authorizationRequestId } = req.body;

    try {
      const prediction = await mlPredictionService.predictCost({
        authorizationRequestId,
        modelType: 'cost_prediction'
      });

      res.json({
        success: true,
        data: prediction,
        metadata: {
          requestId: authorizationRequestId,
          timestamp: new Date().toISOString()
        }
      });

      logger.info('Cost prediction served', {
        userId: req.user?.id,
        requestId: authorizationRequestId,
        predictedCost: prediction.predictedCost
      });

    } catch (error) {
      logger.error('Cost prediction error:', error);
      res.status(500).json({
        success: false,
        message: 'Cost prediction service temporarily unavailable',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/predict/comprehensive:
 *   post:
 *     summary: Get all predictions for an authorization request
 *     tags: [ML Predictions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/predict/comprehensive',
  [
    body('authorizationRequestId')
      .isUUID()
      .withMessage('Authorization request ID must be a valid UUID')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { authorizationRequestId } = req.body;

    try {
      const predictions = await mlPredictionService.getComprehensivePrediction(authorizationRequestId);

      res.json({
        success: true,
        data: predictions,
        metadata: {
          requestId: authorizationRequestId,
          timestamp: new Date().toISOString(),
          predictionTypes: ['authorization', 'fraud', 'risk', 'cost']
        }
      });

      logger.info('Comprehensive prediction served', {
        userId: req.user?.id,
        requestId: authorizationRequestId,
        authRecommendation: predictions.authorization.recommendation,
        fraudRisk: predictions.fraud.riskLevel,
        overallRisk: predictions.risk.overallRisk,
        predictedCost: predictions.cost.predictedCost
      });

    } catch (error) {
      logger.error('Comprehensive prediction error:', error);
      res.status(500).json({
        success: false,
        message: 'Comprehensive prediction service temporarily unavailable',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/batch/predict:
 *   post:
 *     summary: Get batch predictions for multiple authorization requests
 *     tags: [ML Predictions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/batch/predict',
  [
    body('requests')
      .isArray({ min: 1, max: 50 })
      .withMessage('Requests must be an array with 1-50 items'),
    body('requests.*.authorizationRequestId')
      .isUUID()
      .withMessage('Each request must have a valid authorization request ID'),
    body('requests.*.predictionTypes')
      .optional()
      .isArray()
      .withMessage('Prediction types must be an array'),
    body('requests.*.predictionTypes.*')
      .optional()
      .isIn(['authorization', 'fraud', 'risk', 'cost'])
      .withMessage('Invalid prediction type')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { requests } = req.body;

    try {
      const batchResults = await Promise.allSettled(
        requests.map(async (request: any) => {
          const { authorizationRequestId, predictionTypes = ['authorization'] } = request;
          
          const predictions: any = {};
          
          if (predictionTypes.includes('authorization')) {
            predictions.authorization = await mlPredictionService.predictAuthorization({
              authorizationRequestId,
              modelType: 'authorization',
              requestFastTrack: true // Use fast track for batch requests
            });
          }
          
          if (predictionTypes.includes('fraud')) {
            predictions.fraud = await mlPredictionService.predictFraud({
              authorizationRequestId,
              modelType: 'fraud'
            });
          }
          
          if (predictionTypes.includes('risk')) {
            predictions.risk = await mlPredictionService.assessRisk({
              authorizationRequestId,
              modelType: 'risk_assessment'
            });
          }
          
          if (predictionTypes.includes('cost')) {
            predictions.cost = await mlPredictionService.predictCost({
              authorizationRequestId,
              modelType: 'cost_prediction'
            });
          }

          return {
            authorizationRequestId,
            predictions,
            status: 'fulfilled'
          };
        })
      );

      const results = batchResults.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            authorizationRequestId: requests[index].authorizationRequestId,
            error: result.reason?.message || 'Prediction failed',
            status: 'rejected'
          };
        }
      });

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.length - successCount;

      res.json({
        success: true,
        data: results,
        metadata: {
          totalRequests: requests.length,
          successCount,
          failureCount,
          timestamp: new Date().toISOString()
        }
      });

      logger.info('Batch prediction served', {
        userId: req.user?.id,
        totalRequests: requests.length,
        successCount,
        failureCount
      });

    } catch (error) {
      logger.error('Batch prediction error:', error);
      res.status(500).json({
        success: false,
        message: 'Batch prediction service temporarily unavailable',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/models/status:
 *   get:
 *     summary: Get ML models status and performance
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 */
router.get('/models/status',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // This would integrate with your model monitoring system
      const modelStatus = {
        authorization: {
          version: 'v2.1',
          status: 'active',
          accuracy: 0.94,
          lastUpdated: '2024-06-20T10:00:00Z',
          requestsProcessed: 15432,
          avgResponseTime: 245
        },
        fraud_detection: {
          version: 'v1.8',
          status: 'active',
          accuracy: 0.91,
          lastUpdated: '2024-06-19T15:30:00Z',
          requestsProcessed: 8932,
          avgResponseTime: 189
        },
        risk_assessment: {
          version: 'v1.5',
          status: 'active',
          accuracy: 0.87,
          lastUpdated: '2024-06-18T09:15:00Z',
          requestsProcessed: 12045,
          avgResponseTime: 298
        },
        cost_prediction: {
          version: 'v1.2',
          status: 'active',
          accuracy: 0.82,
          lastUpdated: '2024-06-17T14:45:00Z',
          requestsProcessed: 6234,
          avgResponseTime: 156
        }
      };

      res.json({
        success: true,
        data: modelStatus,
        metadata: {
          timestamp: new Date().toISOString(),
          systemLoad: 'normal',
          healthStatus: 'healthy'
        }
      });

    } catch (error) {
      logger.error('Model status error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to retrieve model status',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/explain/{predictionId}:
 *   get:
 *     summary: Get detailed explanation for a prediction
 *     tags: [ML Explanations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: predictionId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 */
router.get('/explain/:predictionId',
  [
    param('predictionId')
      .isUUID()
      .withMessage('Prediction ID must be a valid UUID')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { predictionId } = req.params;

    try {
      // Retrieve prediction explanation from database
      const analysisResult = await mlPredictionService['prisma'].analysisResult.findUnique({
        where: { id: predictionId },
        include: { model: true }
      });

      if (!analysisResult) {
        res.status(404).json({
          success: false,
          message: 'Prediction not found'
        });
        return;
      }

      const explanation = {
        predictionId,
        modelInfo: {
          name: analysisResult.model.name,
          version: analysisResult.model.version,
          type: analysisResult.model.type
        },
        explanation: analysisResult.findings,
        confidence: analysisResult.confidenceScore,
        riskScore: analysisResult.riskScore,
        createdAt: analysisResult.analyzedAt,
        processingTime: analysisResult.processingTimeMs
      };

      res.json({
        success: true,
        data: explanation,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Prediction explanation error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to retrieve prediction explanation',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

/**
 * @swagger
 * /api/ml/feedback:
 *   post:
 *     summary: Submit feedback on prediction accuracy
 *     tags: [ML Feedback]
 *     security:
 *       - bearerAuth: []
 */
router.post('/feedback',
  [
    body('predictionId')
      .isUUID()
      .withMessage('Prediction ID must be a valid UUID'),
    body('actualOutcome')
      .notEmpty()
      .withMessage('Actual outcome is required'),
    body('feedbackType')
      .isIn(['correct', 'incorrect', 'partially_correct'])
      .withMessage('Invalid feedback type'),
    body('comments')
      .optional()
      .isString()
      .isLength({ max: 1000 })
      .withMessage('Comments must be a string with max 1000 characters')
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { predictionId, actualOutcome, feedbackType, comments } = req.body;

    try {
      // Store feedback in database for model improvement
      const feedback = {
        predictionId,
        userId: req.user?.id,
        actualOutcome,
        feedbackType,
        comments,
        submittedAt: new Date()
      };

      // This would be stored in a feedback table for model retraining
      logger.info('ML feedback received', feedback);

      res.json({
        success: true,
        message: 'Feedback submitted successfully',
        data: {
          feedbackId: `feedback_${Date.now()}`, // Generate proper ID
          status: 'received'
        }
      });

    } catch (error) {
      logger.error('Feedback submission error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to submit feedback',
        error: process.env.NODE_ENV === 'development' ? getErrorMessage(error) : undefined
      });
    }
  })
);

export default router;