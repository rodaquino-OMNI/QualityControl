import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { body, query, validationResult } from 'express-validator';
import argon2 from 'argon2';
import { RBACService } from '../services/rbac.service';

export class UserController {
  private prisma: PrismaClient;
  private rbacService: RBACService;

  constructor(prisma: PrismaClient, rbacService: RBACService) {
    this.prisma = prisma;
    this.rbacService = rbacService;
  }

  /**
   * Get all users (paginated)
   * GET /api/users
   */
  getUsers = [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('search').optional().trim(),
    query('role').optional().trim(),
    query('isActive').optional().isBoolean().toBoolean(),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const page = req.query.page as number || 1;
        const limit = req.query.limit as number || 20;
        const search = req.query.search as string;
        const role = req.query.role as string;
        const isActive = req.query.isActive as boolean;

        const skip = (page - 1) * limit;

        // Build where clause
        const where: any = {};
        
        if (search) {
          where.OR = [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
          ];
        }

        if (role) {
          where.roles = {
            some: {
              role: {
                name: role,
              },
            },
          };
        }

        if (isActive !== undefined) {
          where.isActive = isActive;
        }

        // Get users
        const [users, total] = await Promise.all([
          this.prisma.user.findMany({
            where,
            skip,
            take: limit,
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
              updatedAt: true,
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
            orderBy: {
              createdAt: 'desc',
            },
          }),
          this.prisma.user.count({ where }),
        ]);

        res.json({
          users: users.map((user) => ({
            ...user,
            roles: user.roles.map((r) => r.role),
          })),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      } catch (error: any) {
        res.status(500).json({
          error: 'Failed to fetch users',
          code: 'FETCH_USERS_FAILED',
        });
      }
    },
  ];

  /**
   * Get user by ID
   * GET /api/users/:id
   */
  getUserById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const user = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          isActive: true,
          isEmailVerified: true,
          emailVerifiedAt: true,
          mfaEnabled: true,
          createdAt: true,
          updatedAt: true,
          roles: {
            select: {
              assignedAt: true,
              role: {
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  description: true,
                },
              },
            },
          },
          loginHistory: {
            select: {
              ipAddress: true,
              userAgent: true,
              loginMethod: true,
              success: true,
              createdAt: true,
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 10,
          },
        },
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      // Get permissions
      const permissions = await this.rbacService.getUserPermissions(id);

      res.json({
        ...user,
        roles: user.roles.map((r) => r.role),
        permissions: Array.from(permissions),
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to fetch user',
        code: 'FETCH_USER_FAILED',
      });
    }
  };

  /**
   * Create new user
   * POST /api/users
   */
  createUser = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('firstName').trim().notEmpty(),
    body('lastName').trim().notEmpty(),
    body('username').optional().trim().isLength({ min: 3 }),
    body('roles').isArray().optional(),
    body('isActive').optional().isBoolean(),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, firstName, lastName, username, roles, isActive } = req.body;

        // Check if user exists
        const existing = await this.prisma.user.findUnique({
          where: { email },
        });

        if (existing) {
          return res.status(400).json({
            error: 'User with this email already exists',
            code: 'USER_EXISTS',
          });
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
            isActive: isActive ?? true,
            roles: {
              create: roles?.map((roleName: string) => ({
                role: {
                  connect: { name: roleName },
                },
                assignedBy: req.user?.id,
              })) || [
                {
                  role: { connect: { name: 'auditor' } },
                  assignedBy: req.user?.id,
                },
              ],
            },
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            isActive: true,
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

        res.status(201).json({
          ...user,
          roles: user.roles.map((r) => r.role),
        });
      } catch (error: any) {
        res.status(500).json({
          error: 'Failed to create user',
          code: 'CREATE_USER_FAILED',
        });
      }
    },
  ];

  /**
   * Update user
   * PUT /api/users/:id
   */
  updateUser = [
    body('email').optional().isEmail().normalizeEmail(),
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('username').optional().trim().isLength({ min: 3 }),
    body('isActive').optional().isBoolean(),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { email, firstName, lastName, username, isActive } = req.body;

        // Check if user exists
        const existing = await this.prisma.user.findUnique({
          where: { id },
        });

        if (!existing) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          });
        }

        // Update user
        const user = await this.prisma.user.update({
          where: { id },
          data: {
            email,
            firstName,
            lastName,
            username,
            isActive,
          },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            username: true,
            isActive: true,
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

        res.json({
          ...user,
          roles: user.roles.map((r) => r.role),
        });
      } catch (error: any) {
        res.status(500).json({
          error: 'Failed to update user',
          code: 'UPDATE_USER_FAILED',
        });
      }
    },
  ];

  /**
   * Delete user
   * DELETE /api/users/:id
   */
  deleteUser = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Don't allow self-deletion
      if (req.user?.id === id) {
        return res.status(400).json({
          error: 'Cannot delete your own account',
          code: 'SELF_DELETE',
        });
      }

      // Check if user exists
      const existing = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }

      // Soft delete by deactivating
      await this.prisma.user.update({
        where: { id },
        data: {
          isActive: false,
        },
      });

      res.json({ message: 'User deactivated successfully' });
    } catch (error: any) {
      res.status(500).json({
        error: 'Failed to delete user',
        code: 'DELETE_USER_FAILED',
      });
    }
  };

  /**
   * Update user roles
   * PUT /api/users/:id/roles
   */
  updateUserRoles = [
    body('roles').isArray(),
    body('roles.*').isString(),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { roles } = req.body;

        // Check if user exists
        const existing = await this.prisma.user.findUnique({
          where: { id },
        });

        if (!existing) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          });
        }

        // Remove all existing roles
        await this.prisma.userRole.deleteMany({
          where: { userId: id },
        });

        // Add new roles
        for (const roleName of roles) {
          await this.rbacService.assignRole(id, roleName, req.user?.id);
        }

        // Fetch updated user
        const user = await this.prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
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

        res.json({
          ...user,
          roles: user?.roles.map((r) => r.role) || [],
        });
      } catch (error: any) {
        res.status(500).json({
          error: 'Failed to update user roles',
          code: 'UPDATE_ROLES_FAILED',
        });
      }
    },
  ];

  /**
   * Reset user password
   * POST /api/users/:id/reset-password
   */
  resetPassword = [
    body('password').isLength({ min: 8 }),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { password } = req.body;

        // Check if user exists
        const existing = await this.prisma.user.findUnique({
          where: { id },
        });

        if (!existing) {
          return res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          });
        }

        // Hash new password
        const hashedPassword = await argon2.hash(password);

        // Update password
        await this.prisma.user.update({
          where: { id },
          data: {
            password: hashedPassword,
          },
        });

        res.json({ message: 'Password reset successfully' });
      } catch (error: any) {
        res.status(500).json({
          error: 'Failed to reset password',
          code: 'RESET_PASSWORD_FAILED',
        });
      }
    },
  ];
}