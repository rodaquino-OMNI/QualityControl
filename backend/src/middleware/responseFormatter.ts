import { Request, Response, NextFunction } from 'express';

interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
  timestamp: string;
  path: string;
  requestId?: string;
}

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
  path: string;
  requestId?: string;
}

/**
 * Middleware to format all API responses consistently
 */
export const responseFormatter = (req: Request, res: Response, next: NextFunction) => {
  // Store original methods
  const originalJson = res.json;
  const originalSend = res.send;
  const requestId = (req as any).id || req.headers['x-request-id'];

  // Override json method
  res.json = function(data: any): Response {
    res.json = originalJson; // Restore original method

    // Format successful responses
    if (res.statusCode >= 200 && res.statusCode < 400) {
      const formattedResponse: SuccessResponse = {
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: req.originalUrl || req.path,
      };

      if (requestId) {
        formattedResponse.requestId = requestId;
      }

      // Add pagination meta if present
      if (data && typeof data === 'object' && 'data' in data && 'meta' in data) {
        formattedResponse.data = data.data;
        formattedResponse.meta = data.meta;
      }

      return originalJson.call(this, formattedResponse);
    }

    // Format error responses (already handled by errorHandler)
    return originalJson.call(this, data);
  };

  // Override send method for non-JSON responses
  res.send = function(data: any): Response {
    res.send = originalSend; // Restore original method

    // If it's a string and looks like JSON, parse and format it
    if (typeof data === 'string' && res.get('Content-Type')?.includes('json')) {
      try {
        const parsed = JSON.parse(data);
        return res.json(parsed);
      } catch {
        // Not JSON, send as is
      }
    }

    return originalSend.call(this, data);
  };

  next();
};

/**
 * Helper functions for creating paginated responses
 */
export const paginatedResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  total: number
) => {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

/**
 * Helper function for creating standardized error responses
 */
export const errorResponse = (
  code: string,
  message: string,
  statusCode: number,
  details?: any
) => {
  return {
    statusCode,
    error: {
      code,
      message,
      details,
    },
  };
};

/**
 * Middleware to add response time header
 */
export const responseTime = (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime.bigint();

  // Add listener for response finish
  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1e6; // Convert to milliseconds
    res.setHeader('X-Response-Time', `${responseTime.toFixed(2)}ms`);
  });

  next();
};

/**
 * Middleware to add cache headers
 */
export const cacheControl = (options: {
  maxAge?: number;
  sMaxAge?: number;
  private?: boolean;
  public?: boolean;
  noStore?: boolean;
  noCache?: boolean;
  mustRevalidate?: boolean;
  immutable?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const directives: string[] = [];

    if (options.private) directives.push('private');
    else if (options.public) directives.push('public');

    if (options.noStore) directives.push('no-store');
    if (options.noCache) directives.push('no-cache');
    if (options.mustRevalidate) directives.push('must-revalidate');
    if (options.immutable) directives.push('immutable');

    if (options.maxAge !== undefined) {
      directives.push(`max-age=${options.maxAge}`);
    }

    if (options.sMaxAge !== undefined) {
      directives.push(`s-maxage=${options.sMaxAge}`);
    }

    if (directives.length > 0) {
      res.setHeader('Cache-Control', directives.join(', '));
    }

    next();
  };
};

/**
 * No-cache middleware for sensitive endpoints
 */
export const noCache = cacheControl({
  noStore: true,
  noCache: true,
  mustRevalidate: true,
  private: true,
});

/**
 * Cache middleware for public static resources
 */
export const publicCache = (maxAge: number = 3600) => cacheControl({
  public: true,
  maxAge,
  sMaxAge: maxAge,
});

/**
 * ETag support
 */
export const etag = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;

  res.json = function(data: any): Response {
    res.json = originalJson;

    // Generate simple ETag from response data
    const content = JSON.stringify(data);
    const hash = require('crypto')
      .createHash('md5')
      .update(content)
      .digest('hex');
    const etag = `"${hash}"`;

    // Set ETag header
    res.setHeader('ETag', etag);

    // Check if client has matching ETag
    const clientETag = req.headers['if-none-match'];
    if (clientETag === etag) {
      res.status(304).end();
      return res;
    }

    return originalJson.call(this, data);
  };

  next();
};