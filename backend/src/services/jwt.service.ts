import { sign, verify, decode, TokenExpiredError, JsonWebTokenError, SignOptions } from 'jsonwebtoken';
import { authConfig } from '../config/auth.config';
import { User } from '@prisma/client';

export interface TokenPayload {
  sub: string; // User ID
  email: string;
  roles: string[];
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload extends TokenPayload {
  deviceId?: string;
}

export class JWTService {
  /**
   * Generate access token
   */
  static generateAccessToken(user: User, roles: string[]): string {
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      roles,
      type: 'access',
    };

    const options = {
      expiresIn: authConfig.jwt.accessTokenExpiry,
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
    } as SignOptions;
    
    return sign(payload, authConfig.jwt.accessTokenSecret as string, options);
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(user: User, roles: string[], deviceId?: string): string {
    const payload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      roles,
      type: 'refresh',
      deviceId,
    };

    const options = {
      expiresIn: authConfig.jwt.refreshTokenExpiry,
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
    } as SignOptions;
    
    return sign(payload, authConfig.jwt.refreshTokenSecret as string, options);
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string): TokenPayload {
    try {
      const decoded = verify(token, authConfig.jwt.accessTokenSecret, {
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
      }) as TokenPayload;

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new Error('Access token expired');
      }
      if (error instanceof JsonWebTokenError) {
        throw new Error('Invalid access token');
      }
      throw error;
    }
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = verify(token, authConfig.jwt.refreshTokenSecret, {
        issuer: authConfig.jwt.issuer,
        audience: authConfig.jwt.audience,
      }) as RefreshTokenPayload;

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new Error('Refresh token expired');
      }
      if (error instanceof JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Generate token pair (access + refresh)
   */
  static generateTokenPair(user: User, roles: string[], deviceId?: string) {
    return {
      accessToken: this.generateAccessToken(user, roles),
      refreshToken: this.generateRefreshToken(user, roles, deviceId),
    };
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Decode token without verification (for debugging)
   */
  static decodeToken(token: string): any {
    return decode(token);
  }
}