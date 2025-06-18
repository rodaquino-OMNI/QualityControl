import { PrismaClient, User } from '@prisma/client';
import argon2 from 'argon2';
import { Issuer, generators } from 'openid-client';
import speakeasy from 'speakeasy';
import { authConfig } from '../config/auth.config';
import { JWTService } from './jwt.service';
import { RedisService } from './redis.service';

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
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await argon2.hash(password);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        username,
        roles: {
          create: {
            role: {
              connect: {
                name: 'auditor', // Default role
              },
            },
          },
        },
      },
    });

    // Log registration
    await this.logAuthEvent(user.id, 'register', true);

    return user;
  }

  /**
   * Login with email and password
   */
  async login(email: string, password: string, deviceId?: string): Promise<LoginResult> {
    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !user.password) {
      await this.logAuthEvent(null, 'login', false, 'Invalid credentials');
      throw new Error('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await argon2.verify(user.password, password);
    if (!isValidPassword) {
      await this.logAuthEvent(user.id, 'login', false, 'Invalid password');
      throw new Error('Invalid email or password');
    }

    // Check if user is active
    if (!user.isActive) {
      await this.logAuthEvent(user.id, 'login', false, 'Account inactive');
      throw new Error('Account is inactive');
    }

    // Check if MFA is enabled
    if (user.mfaEnabled) {
      await this.logAuthEvent(user.id, 'login', true, 'MFA required');
      return {
        user,
        accessToken: '',
        refreshToken: '',
        requiresMFA: true,
      };
    }

    // Generate tokens
    const roles = user.roles.map((ur) => ur.role.name);
    const { accessToken, refreshToken } = JWTService.generateTokenPair(user, roles, deviceId);

    // Store refresh token
    await this.storeRefreshToken(user.id, refreshToken, deviceId);

    // Log successful login
    await this.logAuthEvent(user.id, 'login', true);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  /**
   * Complete MFA verification
   */
  async verifyMFA(userId: string, token: string, deviceId?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
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
    const roles = user.roles.map((ur) => ur.role.name);
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
        provider_providerUserId: {
          provider,
          providerUserId: profile.id,
        },
      },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
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
          avatar: profile.avatar,
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
        include: {
          roles: {
            include: {
              role: true,
            },
          },
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
            providerUserId: profile.id,
          },
        });
      } else {
        // Create new user
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatar: profile.avatar,
            isEmailVerified: true,
            emailVerifiedAt: new Date(),
            oauthAccounts: {
              create: {
                provider,
                providerUserId: profile.id,
              },
            },
            roles: {
              create: {
                role: {
                  connect: {
                    name: 'auditor', // Default role
                  },
                },
              },
            },
          },
          include: {
            roles: {
              include: {
                role: true,
              },
            },
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
    const roles = user.roles.map((ur) => ur.role.name);
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
        user: {
          include: {
            roles: {
              include: {
                role: true,
              },
            },
          },
        },
      },
    });

    if (!storedToken || storedToken.revokedAt) {
      throw new Error('Invalid refresh token');
    }

    // Check if token is expired
    if (storedToken.expiresAt < new Date()) {
      throw new Error('Refresh token expired');
    }

    // Update last used
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { lastUsedAt: new Date() },
    });

    // Generate new tokens
    const roles = storedToken.user.roles.map((ur) => ur.role.name);
    const newTokens = JWTService.generateTokenPair(
      storedToken.user,
      roles,
      payload.deviceId
    );

    // Revoke old refresh token
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt: new Date(),
        revokedReason: 'Token refreshed',
      },
    });

    // Store new refresh token
    await this.storeRefreshToken(storedToken.userId, newTokens.refreshToken, payload.deviceId);

    return newTokens;
  }

  /**
   * Logout user
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Revoke specific refresh token
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          token: refreshToken,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'User logout',
        },
      });
    } else {
      // Revoke all refresh tokens for user
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          revokedReason: 'User logout (all devices)',
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
  private async storeRefreshToken(userId: string, token: string, deviceId?: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        deviceId,
        expiresAt,
      },
    });
  }

  /**
   * Log authentication event
   */
  private async logAuthEvent(
    userId: string | null,
    action: string,
    success: boolean,
    details?: string
  ): Promise<void> {
    await this.prisma.loginHistory.create({
      data: {
        userId: userId || '',
        ipAddress: '0.0.0.0', // Should be extracted from request
        userAgent: '', // Should be extracted from request
        loginMethod: action,
        success,
        failureReason: success ? null : details,
      },
    });
  }
}