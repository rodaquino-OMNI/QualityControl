import { Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import { AnalyticsService } from '../services/analyticsService';
import { RedisService } from '../services/redisService';
import { validateAnalyticsQuery } from '../validators/analyticsValidator';
import { logger } from '../utils/logger';
import { parse, isValid } from 'date-fns';

const redisService = new RedisService();
const analyticsService = new AnalyticsService(redisService);

export const getAnalytics = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = validateAnalyticsQuery(req.query);
    
    if (error) {
      res.status(400).json({
        success: false,
        error: error.details[0].message
      });
      return;
    }

    const query = {
      startDate: new Date(value.startDate),
      endDate: new Date(value.endDate),
      metrics: value.metrics,
      groupBy: value.groupBy,
      auditors: value.auditors,
      caseTypes: value.caseTypes,
      priority: value.priority,
      fraudRiskLevel: value.fraudRiskLevel
    };

    const metrics = await analyticsService.getAggregatedMetrics(query);

    res.json({
      success: true,
      data: metrics
    });
  }
);

export const getCaseMetrics = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;
    
    const query = {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    };

    const caseMetrics = await analyticsService.getCaseMetrics(query);

    res.json({
      success: true,
      data: caseMetrics
    });
  }
);

export const getPerformanceMetrics = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate, auditors } = req.query;
    
    const query = {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      auditors: auditors ? (auditors as string).split(',') : undefined
    };

    const performanceMetrics = await analyticsService.getPerformanceMetrics(query);

    res.json({
      success: true,
      data: performanceMetrics
    });
  }
);

export const getFraudMetrics = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate, riskLevel } = req.query;
    
    const query = {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      fraudRiskLevel: riskLevel as 'high' | 'medium' | 'low' | undefined
    };

    const fraudMetrics = await analyticsService.getFraudMetrics(query);

    res.json({
      success: true,
      data: fraudMetrics
    });
  }
);

export const getAIMetrics = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;
    
    const query = {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    };

    const aiMetrics = await analyticsService.getAIMetrics(query);

    res.json({
      success: true,
      data: aiMetrics
    });
  }
);

export const getTimeSeriesData = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate, groupBy } = req.query;
    
    const query = {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string),
      groupBy: groupBy as 'day' | 'week' | 'month' | 'hour' | undefined
    };

    const timeSeries = await analyticsService.getTimeSeriesData(query);

    res.json({
      success: true,
      data: timeSeries
    });
  }
);

export const getKPIs = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate } = req.query;
    
    const query = {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    };

    const kpis = await analyticsService.getKPIs(query);

    res.json({
      success: true,
      data: kpis
    });
  }
);

export const getRealTimeMetrics = asyncHandler(
  async (req: Request, res: Response) => {
    const metrics = await analyticsService.getRealTimeMetrics();

    res.json({
      success: true,
      data: metrics
    });
  }
);

export const exportAnalytics = asyncHandler(
  async (req: Request, res: Response) => {
    const { startDate, endDate, format = 'json' } = req.query;
    
    const query = {
      startDate: new Date(startDate as string),
      endDate: new Date(endDate as string)
    };

    const data = await analyticsService.exportAnalytics(
      query, 
      format as 'csv' | 'json'
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="analytics.csv"');
      res.send(data);
    } else {
      res.json({
        success: true,
        data
      });
    }
  }
);

// WebSocket handler for real-time updates
export const subscribeToRealTimeUpdates = async (ws: any) => {
  const sendMetrics = async () => {
    try {
      const metrics = await analyticsService.getRealTimeMetrics();
      ws.send(JSON.stringify({
        type: 'metrics_update',
        data: metrics
      }));
    } catch (error) {
      logger.error('Error sending real-time metrics:', error);
    }
  };

  // Send initial metrics
  await sendMetrics();

  // Set up interval for updates
  const interval = setInterval(sendMetrics, 3000);

  // Clean up on disconnect
  ws.on('close', () => {
    clearInterval(interval);
  });
};