import { config } from 'dotenv';

config();

export const authConfig = {
  jwt: {
    accessTokenSecret: process.env.JWT_SECRET || 'change-this-secret',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret',
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
    issuer: 'austa-cockpit',
    audience: 'austa-users',
  },
  oauth: {
    google: {
      issuer: process.env.OIDC_ISSUER || 'https://accounts.google.com',
      clientId: process.env.OIDC_CLIENT_ID || '',
      clientSecret: process.env.OIDC_CLIENT_SECRET || '',
      redirectUri: process.env.OIDC_REDIRECT_URI || 'http://localhost:3000/api/auth/callback',
      scope: ['openid', 'email', 'profile'],
    },
  },
  session: {
    secret: process.env.SESSION_SECRET || 'change-this-session-secret',
    name: process.env.SESSION_NAME || 'austa_session',
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000'), // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },
  mfa: {
    issuer: process.env.MFA_ISSUER || 'AUSTA Cockpit',
    window: parseInt(process.env.MFA_WINDOW || '1'),
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
  },
};