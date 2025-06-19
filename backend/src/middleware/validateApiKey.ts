import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { cache } from '../config/redis';
import { prisma } from '../config/database';

declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        name: string;
      };
    }
  }
}

export const validateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      throw new AppError('API key required', 401, 'API_KEY_REQUIRED');
    }

    // Check cache first
    const cachedKey = await cache.get(`apikey:${apiKey}`);
    if (cachedKey) {
      req.apiKey = cachedKey as any;
      return next();
    }

    // Check database
    const keyRecord = await prisma.aPIKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!keyRecord) {
      throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
    }

    // APIKey model doesn't have updatedAt, so we skip updating timestamp

    // Cache the key
    await cache.set(
      `apikey:${apiKey}`,
      {
        id: keyRecord.id,
        name: keyRecord.name,
      },
      3600 // 1 hour
    );

    req.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
    };

    next();
  } catch (error) {
    next(error);
  }
};