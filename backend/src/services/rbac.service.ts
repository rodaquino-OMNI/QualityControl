import { PrismaClient, User, Role, Permission } from '@prisma/client';

export interface UserWithRolesAndPermissions extends User {
  permissions?: string[];
}

export class RBACService {
  private prisma: PrismaClient;
  private permissionCache: Map<string, Set<string>> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId: string): Promise<Set<string>> {
    // Check cache first
    if (this.permissionCache.has(userId)) {
      return this.permissionCache.get(userId)!;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return new Set();
    }

    const permissions = new Set<string>();

    // Collect all permissions from all roles
    for (const userRole of user.roles) {
      for (const rolePermission of userRole.role.permissions) {
        const permString = `${rolePermission.permission.resource}:${rolePermission.permission.action}`;
        permissions.add(permString);
      }
    }

    // Cache for 5 minutes
    this.permissionCache.set(userId, permissions);
    setTimeout(() => this.permissionCache.delete(userId), 5 * 60 * 1000);

    return permissions;
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.has(`${resource}:${action}`);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(
    userId: string,
    requiredPermissions: Array<{ resource: string; action: string }>
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);

    for (const { resource, action } of requiredPermissions) {
      if (userPermissions.has(`${resource}:${action}`)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has all of the specified permissions
   */
  async hasAllPermissions(
    userId: string,
    requiredPermissions: Array<{ resource: string; action: string }>
  ): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);

    for (const { resource, action } of requiredPermissions) {
      if (!userPermissions.has(`${resource}:${action}`)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<string[]> {
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

    if (!user) {
      return [];
    }

    return user.roles.map((ur) => ur.role.name);
  }

  /**
   * Check if user has a specific role
   */
  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.includes(roleName);
  }

  /**
   * Check if user has any of the specified roles
   */
  async hasAnyRole(userId: string, roleNames: string[]): Promise<boolean> {
    const userRoles = await this.getUserRoles(userId);
    return roleNames.some((role) => userRoles.includes(role));
  }

  /**
   * Assign role to user
   */
  async assignRole(userId: string, roleName: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    await this.prisma.userRole.create({
      data: {
        userId,
        roleId: role.id,
      },
    });

    // Clear cache
    this.permissionCache.delete(userId);
  }

  /**
   * Remove role from user
   */
  async removeRole(userId: string, roleName: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    await this.prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
    });

    // Clear cache
    this.permissionCache.delete(userId);
  }

  /**
   * Create a new role
   */
  async createRole(
    name: string,
    description?: string
  ): Promise<Role> {
    return await this.prisma.role.create({
      data: {
        name,
        description,
      },
    });
  }

  /**
   * Create a new permission
   */
  async createPermission(
    resource: string,
    action: string,
    description?: string
  ): Promise<Permission> {
    return await this.prisma.permission.create({
      data: {
        resource,
        action,
        description,
      },
    });
  }

  /**
   * Assign permission to role
   */
  async assignPermissionToRole(roleName: string, resource: string, action: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    const permission = await this.prisma.permission.findUnique({
      where: {
        resource_action: {
          resource,
          action,
        },
      },
    });

    if (!permission) {
      throw new Error(`Permission ${resource}:${action} not found`);
    }

    await this.prisma.rolePermission.create({
      data: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });

    // Clear all user caches for this role
    const usersWithRole = await this.prisma.userRole.findMany({
      where: { roleId: role.id },
      select: { userId: true },
    });

    for (const { userId } of usersWithRole) {
      this.permissionCache.delete(userId);
    }
  }

  /**
   * Initialize default roles and permissions
   */
  async initializeDefaultRolesAndPermissions(): Promise<void> {
    // Default permissions
    const defaultPermissions = [
      // Cases
      { resource: 'cases', action: 'create', description: 'Create new cases' },
      { resource: 'cases', action: 'read', description: 'View cases' },
      { resource: 'cases', action: 'update', description: 'Update cases' },
      { resource: 'cases', action: 'delete', description: 'Delete cases' },
      { resource: 'cases', action: 'approve', description: 'Approve cases' },
      { resource: 'cases', action: 'reject', description: 'Reject cases' },
      
      // Users
      { resource: 'users', action: 'create', description: 'Create new users' },
      { resource: 'users', action: 'read', description: 'View users' },
      { resource: 'users', action: 'update', description: 'Update users' },
      { resource: 'users', action: 'delete', description: 'Delete users' },
      
      // Reports
      { resource: 'reports', action: 'create', description: 'Create reports' },
      { resource: 'reports', action: 'read', description: 'View reports' },
      { resource: 'reports', action: 'export', description: 'Export reports' },
      
      // Settings
      { resource: 'settings', action: 'read', description: 'View settings' },
      { resource: 'settings', action: 'update', description: 'Update settings' },
      
      // AI
      { resource: 'ai', action: 'use', description: 'Use AI features' },
      { resource: 'ai', action: 'configure', description: 'Configure AI models' },
    ];

    // Create permissions
    for (const perm of defaultPermissions) {
      await this.prisma.permission.upsert({
        where: {
          resource_action: {
            resource: perm.resource,
            action: perm.action,
          },
        },
        update: {},
        create: perm,
      });
    }

    // Default roles
    const defaultRoles = [
      {
        name: 'admin',
        description: 'Administrator - Full system access',
        permissions: defaultPermissions.map((p) => `${p.resource}:${p.action}`),
      },
      {
        name: 'auditor',
        description: 'Medical Auditor - Can audit medical cases',
        permissions: [
          'cases:read',
          'cases:update',
          'cases:approve',
          'cases:reject',
          'reports:read',
          'reports:create',
          'ai:use',
        ],
      },
      {
        name: 'viewer',
        description: 'Viewer - Read-only access',
        permissions: ['cases:read', 'reports:read'],
      },
    ];

    // Create roles and assign permissions
    for (const roleData of defaultRoles) {
      const role = await this.prisma.role.upsert({
        where: { name: roleData.name },
        update: {},
        create: {
          name: roleData.name,
          description: roleData.description,
        },
      });

      // Assign permissions
      for (const permString of roleData.permissions) {
        const [resource, action] = permString.split(':');
        const permission = await this.prisma.permission.findUnique({
          where: {
            resource_action: { resource, action },
          },
        });

        if (permission) {
          await this.prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
        }
      }
    }
  }
}