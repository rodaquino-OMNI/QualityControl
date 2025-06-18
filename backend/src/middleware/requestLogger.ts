import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      startTime?: number;
    }
  }
}

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Add request ID
  req.id = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();

  // Log request
  logger.info('HTTP Request', {
    type: 'request',
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString(),
  });

  // Log response
  const originalSend = res.send;
  res.send = function (data) {
    res.send = originalSend;
    
    const responseTime = Date.now() - (req.startTime || 0);
    
    logger.info('HTTP Response', {
      type: 'response',
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      timestamp: new Date().toISOString(),
    });
    
    // Add response time header
    res.set('X-Response-Time', `${responseTime}ms`);
    res.set('X-Request-ID', req.id);
    
    return res.send(data);
  };

  next();
};