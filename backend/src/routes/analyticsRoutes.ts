import { Router } from 'express';
import {
  getAnalytics,
  getCaseMetrics,
  getPerformanceMetrics,
  getFraudMetrics,
  getAIMetrics,
  getTimeSeriesData,
  getKPIs,
  getRealTimeMetrics,
  exportAnalytics
} from '../controllers/analyticsController';

const router = Router();

// Main analytics endpoint
router.get('/analytics', getAnalytics);

// Specific metric endpoints
router.get('/analytics/cases', getCaseMetrics);
router.get('/analytics/performance', getPerformanceMetrics);
router.get('/analytics/fraud', getFraudMetrics);
router.get('/analytics/ai', getAIMetrics);
router.get('/analytics/time-series', getTimeSeriesData);
router.get('/analytics/kpis', getKPIs);

// Real-time metrics
router.get('/analytics/real-time', getRealTimeMetrics);

// Export endpoint
router.get('/analytics/export', exportAnalytics);

export default router;