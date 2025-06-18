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
        organizationId: string;
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
    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        key: apiKey,
        isActive: true,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        name: true,
        organizationId: true,
        rateLimit: true,
        allowedIPs: true,
      },
    });

    if (!keyRecord) {
      throw new AppError('Invalid API key', 401, 'INVALID_API_KEY');
    }

    // Check IP restrictions if configured
    if (keyRecord.allowedIPs && keyRecord.allowedIPs.length > 0) {
      const clientIP = req.ip;
      if (!keyRecord.allowedIPs.includes(clientIP)) {
        throw new AppError('IP not allowed', 403, 'IP_NOT_ALLOWED');
      }
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    // Cache the key
    await cache.set(
      `apikey:${apiKey}`,
      {
        id: keyRecord.id,
        name: keyRecord.name,
        organizationId: keyRecord.organizationId,
      },
      3600 // 1 hour
    );

    req.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
      organizationId: keyRecord.organizationId,
    };

    next();
  } catch (error) {
    next(error);
  }
};