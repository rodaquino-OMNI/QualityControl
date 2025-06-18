import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../services/auth.service';
import { body, validationResult } from 'express-validator';
import { generators } from 'openid-client';

export class AuthController {
  private authService: AuthService;
  private prisma: PrismaClient;

  constructor(authService: AuthService, prisma: PrismaClient) {
    this.authService = authService;
    this.prisma = prisma;
  }

  /**
   * Register a new user
   * POST /api/auth/register
   */
  register = [
    // Validation
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('username').optional().trim().isLength({ min: 3 }),

    async (req: Request, res: Response) => {
      try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, firstName, lastName, username } = req.body;

        const user = await this.authService.register(
          email,
          password,
          firstName,
          lastName,
          username
        );

        res.status(201).json({
          message: 'User registered successfully',
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            username: user.username,
          },
        });
      } catch (error: any) {
        res.status(400).json({
          error: error.message,
          code: 'REGISTRATION_FAILED',
        });
      }
    },
  ];

  /**
   * Login with email and password
   * POST /api/auth/login
   */
  login = [
    // Validation
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    body('deviceId').optional().trim(),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, deviceId } = req.body;
        const result = await this.authService.login(email, password, deviceId);

        if (result.requiresMFA) {
          // Store temporary session for MFA
          return res.status(200).json({
            requiresMFA: true,
            userId: result.user.id,
            message: 'Please provide MFA token',
          });
        }

        res.json({
          user: {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            avatar: result.user.avatar,
          },
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      } catch (error: any) {
        res.status(401).json({
          error: error.message,
          code: 'LOGIN_FAILED',
        });
      }
    },
  ];

  /**
   * Verify MFA token
   * POST /api/auth/mfa/verify
   */
  verifyMFA = [
    body('userId').notEmpty(),
    body('token').matches(/^\d{6}$/),
    body('deviceId').optional().trim(),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { userId, token, deviceId } = req.body;
        const result = await this.authService.verifyMFA(userId, token, deviceId);

        res.json({
          user: {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            avatar: result.user.avatar,
          },
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      } catch (error: any) {
        res.status(401).json({
          error: error.message,
          code: 'MFA_FAILED',
        });
      }
    },
  ];

  /**
   * Enable MFA for authenticated user
   * POST /api/auth/mfa/enable
   */
  enableMFA = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { secret, qrCode } = await this.authService.enableMFA(req.user.id);

      res.json({
        secret,
        qrCode,
        message: 'Scan the QR code with your authenticator app',
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
        code: 'MFA_ENABLE_FAILED',
      });
    }
  };

  /**
   * Disable MFA for authenticated user
   * POST /api/auth/mfa/disable
   */
  disableMFA = [
    body('token').matches(/^\d{6}$/),

    async (req: Request, res: Response) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        // Verify MFA token before disabling
        await this.authService.verifyMFA(req.user.id, req.body.token);

        // Disable MFA
        await this.prisma.user.update({
          where: { id: req.user.id },
          data: {
            mfaEnabled: false,
            mfaSecret: null,
          },
        });

        res.json({ message: 'MFA disabled successfully' });
      } catch (error: any) {
        res.status(400).json({
          error: error.message,
          code: 'MFA_DISABLE_FAILED',
        });
      }
    },
  ];

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = [
    body('refreshToken').notEmpty(),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { refreshToken } = req.body;
        const tokens = await this.authService.refreshToken(refreshToken);

        res.json(tokens);
      } catch (error: any) {
        res.status(401).json({
          error: error.message,
          code: 'REFRESH_FAILED',
        });
      }
    },
  ];

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const refreshToken = req.body.refreshToken;
      await this.authService.logout(req.user.id, refreshToken);

      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
        code: 'LOGOUT_FAILED',
      });
    }
  };

  /**
   * Get current user info
   * GET /api/auth/me
   */
  getCurrentUser = async (req: Request, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const user = await this.prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          isActive: true,
          isEmailVerified: true,
          mfaEnabled: true,
          createdAt: true,
          roles: {
            select: {
              role: {
                select: {
                  name: true,
                  displayName: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        ...user,
        roles: user.roles.map((r) => r.role),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to fetch user',
        code: 'FETCH_USER_FAILED',
      });
    }
  };

  /**
   * Initiate OAuth login
   * GET /api/auth/oauth/:provider
   */
  initiateOAuth = async (req: Request, res: Response) => {
    try {
      const { provider } = req.params;

      if (provider !== 'google') {
        return res.status(400).json({
          error: 'Unsupported OAuth provider',
          code: 'INVALID_PROVIDER',
        });
      }

      const client = await this.authService.getGoogleOAuthClient();
      const state = generators.state();
      const nonce = generators.nonce();

      // Store state in session for verification
      req.session = { state, nonce };

      const authUrl = client.authorizationUrl({
        scope: 'openid email profile',
        state,
        nonce,
      });

      res.json({ authUrl });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to initiate OAuth',
        code: 'OAUTH_INIT_FAILED',
      });
    }
  };

  /**
   * Handle OAuth callback
   * GET /api/auth/callback
   */
  handleOAuthCallback = async (req: Request, res: Response) => {
    try {
      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).json({
          error: 'Missing OAuth parameters',
          code: 'INVALID_CALLBACK',
        });
      }

      // Verify state
      if (req.session?.state !== state) {
        return res.status(400).json({
          error: 'Invalid state parameter',
          code: 'INVALID_STATE',
        });
      }

      const client = await this.authService.getGoogleOAuthClient();
      const params = client.callbackParams(req);
      const tokenSet = await client.callback(
        'http://localhost:3000/api/auth/callback',
        params,
        { state: req.session.state, nonce: req.session.nonce }
      );

      const userinfo = await client.userinfo(tokenSet);

      // Process OAuth login
      const result = await this.authService.oauthLogin(
        {
          id: userinfo.sub,
          email: userinfo.email!,
          firstName: userinfo.given_name || '',
          lastName: userinfo.family_name || '',
          avatar: userinfo.picture,
          provider: 'google',
        },
        'google'
      );

      // Redirect to frontend with tokens
      const redirectUrl = new URL(process.env.FRONTEND_URL || 'http://localhost:5173');
      redirectUrl.searchParams.append('accessToken', result.accessToken);
      redirectUrl.searchParams.append('refreshToken', result.refreshToken);

      res.redirect(redirectUrl.toString());
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
        code: 'OAUTH_CALLBACK_FAILED',
      });
    }
  };
}