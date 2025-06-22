import { PrismaClient, User } from '@prisma/client';
import argon2 from 'argon2';
import { Issuer } from 'openid-client';
import speakeasy from 'speakeasy';
import { authConfig } from '../config/auth.config';
import { JWTService } from './jwt.service';
import { RedisService } from './redisService';
import { AppError, ErrorSeverity, ErrorCategory } from '../middleware/errorHandler';
import { withBusinessOperation, withDatabaseTransaction } from '../utils/asyncWrapper';
import { logger } from '../utils/logger';

export interface LoginResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  requiresMFA?: boolean;
}

export interface OAuthProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  provider: string;
}

export class AuthService {
  private prisma: PrismaClient;
  private redis: RedisService;

  constructor(prisma: PrismaClient, redis: RedisService) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Register a new user with email and password
   */
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    username?: string
  ): Promise<User> {
    return withBusinessOperation(
      'user_registration',
      undefined,
      async () => {
        return withDatabaseTransaction(
          this.prisma,
          async (tx) => {
            // Check if user already exists
            const existingUser = await tx.user.findUnique({
              where: { email },
            });

            if (existingUser) {
              throw new AppError(
                'User with this email already exists',
                409,
                'USER_ALREADY_EXISTS',
                { email },
                ErrorSeverity.LOW,
                ErrorCategory.VALIDATION
              );
            }

            // Validate password strength
            if (password.length < 8) {
              throw new AppError(
                'Password must be at least 8 characters long',
                400,
                'WEAK_PASSWORD',
                { minLength: 8 },
                ErrorSeverity.LOW,
                ErrorCategory.VALIDATION
              );
            }

            try {
              // Hash password
              const hashedPassword = await argon2.hash(password, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16,
                timeCost: 3,
                parallelism: 1,
              });

              // Create user
              const user = await tx.user.create({
                data: {
                  email,
                  password: hashedPassword,
                  name: `${firstName} ${lastName}`,
                  firstName,
                  lastName,
                  username,
                  role: 'auditor', // Default role
                },
              });

              // Log registration
              await this.logAuthEvent(user.id, 'register', true);
              
              logger.info('User registered successfully', {
                userId: user.id,
                email,
                role: user.role,
              });

              return user;

            } catch (hashError) {
              logger.error('Password hashing failed during registration', {
                email,
                error: (hashError as Error).message,
              });
              
              throw new AppError(
                'Failed to process registration',
                500,
                'REGISTRATION_PROCESSING_ERROR',
                undefined,
                ErrorSeverity.HIGH,
                ErrorCategory.SYSTEM
              );
            }
          }
        );
      }
    );
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string, deviceId?: string): Promise<LoginResult> {
    return withBusinessOperation(
      'user_login',
      undefined,
      async () => {
        try {
          // Find user
          const user = await this.prisma.user.findUnique({
            where: { email },
          });

          if (!user || !user.password) {
            await this.logAuthEvent(null, 'login', false, 'Invalid credentials');
            
            throw new AppError(
              'Invalid email or password',
              401,
              'INVALID_CREDENTIALS',
              undefined,
              ErrorSeverity.MEDIUM,
              ErrorCategory.AUTHENTICATION
            );
          }

          try {
            // Verify password
            const isValidPassword = await argon2.verify(user.password, password);
            if (!isValidPassword) {
              await this.logAuthEvent(user.id, 'login', false, 'Invalid password');
              
              throw new AppError(
                'Invalid email or password',
                401,
                'INVALID_CREDENTIALS',
                undefined,
                ErrorSeverity.MEDIUM,
                ErrorCategory.AUTHENTICATION
              );
            }
          } catch (verifyError) {
            logger.error('Password verification failed during login', {
              userId: user.id,
              email,
              error: (verifyError as Error).message,
            });
            
            if (verifyError instanceof AppError) {
              throw verifyError;
            }
            
            throw new AppError(
              'Authentication processing error',
              500,
              'AUTH_PROCESSING_ERROR',
              undefined,
              ErrorSeverity.HIGH,
              ErrorCategory.SYSTEM
            );
          }

          // Check if user is active
          if (!user.isActive) {
            await this.logAuthEvent(user.id, 'login', false, 'Account inactive');
            
            throw new AppError(
              'Account is inactive',
              403,
              'ACCOUNT_INACTIVE',
              { userId: user.id },
              ErrorSeverity.MEDIUM,
              ErrorCategory.AUTHORIZATION
            );
          }

          // Check if MFA is enabled
          if (user.mfaEnabled) {
            await this.logAuthEvent(user.id, 'login', true, 'MFA required');
            
            logger.info('MFA required for user login', {
              userId: user.id,
              email,
            });
            
            return {
              user,
              accessToken: '',
              refreshToken: '',
              requiresMFA: true,
            };
          }

          try {
            // Generate tokens
            const roles = [user.role];
            const { accessToken, refreshToken } = JWTService.generateTokenPair(user, roles, deviceId);

            // Store refresh token in transaction
            await withDatabaseTransaction(
              this.prisma,
              async () => {
                await this.storeRefreshToken(user.id, refreshToken, deviceId);
              }
            );

            // Log successful login
            await this.logAuthEvent(user.id, 'login', true);
            
            logger.info('User login successful', {
              userId: user.id,
              email,
              role: user.role,
              deviceId,
            });

            return {
              user,
              accessToken,
              refreshToken,
            };

          } catch (tokenError) {
            logger.error('Token generation failed during login', {
              userId: user.id,
              email,
              error: (tokenError as Error).message,
            });
            
            throw new AppError(
              'Failed to complete login process',
              500,
              'LOGIN_TOKEN_ERROR',
              undefined,
              ErrorSeverity.HIGH,
              ErrorCategory.SYSTEM
            );
          }

        } catch (error) {
          // Re-throw AppErrors as-is
          if (error instanceof AppError) {
            throw error;
          }
          
          // Handle unexpected errors
          logger.error('Unexpected error during login', {
            email,
            error: (error as Error).message,
            stack: (error as Error).stack,
          });
          
          throw new AppError(
            'Login failed due to an unexpected error',
            500,
            'LOGIN_UNEXPECTED_ERROR',
            undefined,
            ErrorSeverity.CRITICAL,
            ErrorCategory.SYSTEM
          );
        }
      }
    );
  }

  /**
   * Complete MFA verification
   */
  async verifyMFA(userId: string, token: string, deviceId?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.mfaSecret) {
      throw new Error('User not found or MFA not enabled');
    }

    // Verify TOTP token
    const verified = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token,
      window: authConfig.mfa.window,
    });

    if (!verified) {
      await this.logAuthEvent(user.id, 'mfa_verify', false, 'Invalid MFA token');
      throw new Error('Invalid MFA token');
    }

    // Generate tokens
    const roles = [user.role];
    const { accessToken, refreshToken } = JWTService.generateTokenPair(user, roles, deviceId);

    // Store refresh token
    await this.storeRefreshToken(user.id, refreshToken, deviceId);

    // Log successful MFA
    await this.logAuthEvent(user.id, 'mfa_verify', true);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Enable MFA for user
   */
  async enableMFA(userId: string): Promise<{ secret: string; qrCode: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${authConfig.mfa.issuer} (${user.email})`,
      issuer: authConfig.mfa.issuer,
    });

    // Save secret (should be encrypted in production)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaSecret: secret.base32,
        mfaEnabled: true,
      },
    });

    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url || '',
    };
  }

  /**
   * OAuth login/register
   */
  async oauthLogin(profile: OAuthProfile, provider: string): Promise<LoginResult> {
    // Check if OAuth account exists
    let oauthAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerId: {
          provider,
          providerId: profile.id,
        },
      },
      include: {
        user: true,
      },
    });

    let user: User;
    if (oauthAccount) {
      // Update user info
      user = await this.prisma.user.update({
        where: { id: oauthAccount.userId },
        data: {
          firstName: profile.firstName,
          lastName: profile.lastName,
          name: `${profile.firstName} ${profile.lastName}`,
          avatar: profile.avatar,
        },
      });
    } else {
      // Check if user with email exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });

      if (existingUser) {
        // Link OAuth account to existing user
        user = existingUser;
        await this.prisma.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider,
            providerId: profile.id,
          },
        });
      } else {
        // Create new user
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            name: `${profile.firstName} ${profile.lastName}`,
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatar: profile.avatar,
            role: 'auditor', // Default role
            password: '', // OAuth users don't have passwords
          },
        });

        // Create OAuth account link
        await this.prisma.oAuthAccount.create({
          data: {
            userId: user.id,
            provider,
            providerId: profile.id,
          },
        });
      }
    }

    // Check if user is active
    if (!user.isActive) {
      await this.logAuthEvent(user.id, 'oauth_login', false, 'Account inactive');
      throw new Error('Account is inactive');
    }

    // Generate tokens
    const roles = [user.role];
    const { accessToken, refreshToken } = JWTService.generateTokenPair(user, roles);

    // Store refresh token
    await this.storeRefreshToken(user.id, refreshToken);

    // Log successful OAuth login
    await this.logAuthEvent(user.id, 'oauth_login', true, provider);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Verify refresh token
    const payload = JWTService.verifyRefreshToken(refreshToken);

    // Check if token exists in database
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: true,
      },
    });

    if (!storedToken) {
      throw new Error('Invalid refresh token');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      throw new Error('Refresh token expired');
    }

    // Generate new tokens
    const roles = [storedToken.user.role];
    const newTokens = JWTService.generateTokenPair(
      storedToken.user,
      roles,
      payload.deviceId
    );

    // Store new refresh token
    await this.storeRefreshToken(storedToken.userId, newTokens.refreshToken, payload.deviceId);

    return newTokens;
  }

  /**
   * Logout user
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Delete specific refresh token
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          token: refreshToken,
        },
      });
    } else {
      // Delete all refresh tokens for user
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
        },
      });
    }

    // Clear Redis sessions
    await this.redis.clearUserSessions(userId);

    // Log logout
    await this.logAuthEvent(userId, 'logout', true);
  }

  /**
   * Get Google OAuth client
   */
  async getGoogleOAuthClient() {
    const googleIssuer = await Issuer.discover(authConfig.oauth.google.issuer);
    
    return new googleIssuer.Client({
      client_id: authConfig.oauth.google.clientId,
      client_secret: authConfig.oauth.google.clientSecret,
      redirect_uris: [authConfig.oauth.google.redirectUri],
      response_types: ['code'],
    });
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(userId: string, token: string, _deviceId?: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Log authentication event
   */
  private async logAuthEvent(
    userId: string | null,
    _action: string,
    success: boolean,
    _details?: string
  ): Promise<void> {
    if (userId) {
      await this.prisma.loginHistory.create({
        data: {
          userId,
          ipAddress: '0.0.0.0', // Should be extracted from request
          userAgent: '', // Should be extracted from request
          success,
        },
      });
    }
  }
}