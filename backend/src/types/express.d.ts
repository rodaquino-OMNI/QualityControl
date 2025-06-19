// Express type augmentations

import { User } from './index';

declare global {
  namespace Express {
    interface Request {
      // User information from JWT
      user?: {
        id: string;
        email: string;
        roles: string[];
      };
      
      // Session information
      sessionId?: string;
      session?: {
        id: string;
        userId?: string;
        deviceId?: string;
        data?: Record<string, any>;
      };
      
      // Request metadata
      requestId?: string;
      startTime?: number;
      
      // Rate limiting info
      rateLimit?: {
        limit: number;
        remaining: number;
        resetAt: Date;
      };
      
      // API versioning
      apiVersion?: string;
      
      // Device information
      device?: {
        id?: string;
        type?: 'desktop' | 'mobile' | 'tablet';
        os?: string;
        browser?: string;
      };
      
      // Pagination
      pagination?: {
        page: number;
        pageSize: number;
        offset: number;
      };
      
      // File upload
      file?: Express.Multer.File;
      files?: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] };
      
      // Webhook signature
      webhookSignature?: string;
      webhookTimestamp?: string;
      
      // Feature flags
      features?: Record<string, boolean>;
      
      // Request context
      context?: {
        correlationId?: string;
        tenantId?: string;
        locale?: string;
        timezone?: string;
      };
    }
    
    interface Response {
      // Response metadata
      responseTime?: number;
      
      // Cache control
      cacheControl?: {
        maxAge?: number;
        private?: boolean;
        public?: boolean;
        noCache?: boolean;
        noStore?: boolean;
      };
      
      // Pagination helpers
      setPagination?: (data: {
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      }) => void;
      
      // Standard response helpers
      success?: <T>(data: T, message?: string) => void;
      error?: (error: string | Error, code?: string, statusCode?: number) => void;
      paginated?: <T>(data: T[], pagination: {
        page: number;
        pageSize: number;
        totalItems: number;
      }) => void;
    }
  }
}

// Multer file type
declare namespace Express {
  namespace Multer {
    interface File {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      size: number;
      destination: string;
      filename: string;
      path: string;
      buffer: Buffer;
      // S3 specific
      location?: string;
      key?: string;
      bucket?: string;
      etag?: string;
      // Azure specific
      blobName?: string;
      containerName?: string;
      blobType?: string;
      // GCS specific
      cloudStorageObject?: string;
      cloudStoragePublicUrl?: string;
    }
  }
}

export {};