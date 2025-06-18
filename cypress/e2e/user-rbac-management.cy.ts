import { waitForPageLoad, selectFromDropdown, checkNotification, fillForm } from '../support/commands';

describe('User Management and RBAC Testing', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').admin.email, Cypress.env('testUsers').admin.password);
    cy.visit('/admin/users');
    waitForPageLoad();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('User Management', () => {
    it('should create a new user with proper role assignment', () => {
      cy.get('[data-testid="create-user-button"]').click();
      cy.get('[data-testid="create-user-modal"]').should('be.visible');

      const userData = {
        'first-name': 'Jane',
        'last-name': 'Smith',
        'email': 'jane.smith@austa.com',
        'employee-id': 'EMP-2024-001',
        'department': 'Medical Review',
        'phone': '+1-555-0123',
      };

      fillForm(userData);

      // Assign role
      selectFromDropdown('role-select', 'medical-reviewer');

      // Set permissions
      cy.get('[data-testid="permission-case-review"]').check();
      cy.get('[data-testid="permission-case-approve"]').check();
      cy.get('[data-testid="permission-reports-view"]').check();

      // Set access restrictions
      cy.get('[data-testid="access-level-department"]').check();
      selectFromDropdown('accessible-departments', 'cardiology');

      // Account settings
      cy.get('[data-testid="require-mfa"]').check();
      cy.get('[data-testid="account-expiry"]').type('2025-12-31');

      cy.get('[data-testid="create-user"]').click();
      cy.wait('@createUser');

      checkNotification('User created successfully', 'success');

      // Verify user appears in list
      cy.get('[data-testid="user-row"]').should('contain', 'jane.smith@austa.com');
      cy.get('[data-testid="user-role"]').should('contain', 'Medical Reviewer');
    });

    it('should edit existing user details and permissions', () => {
      cy.get('[data-testid="user-row"]').first().within(() => {
        cy.get('[data-testid="edit-user-button"]').click();
      });

      cy.get('[data-testid="edit-user-modal"]').should('be.visible');

      // Update user information
      cy.get('[data-testid="department-input"]').clear().type('Fraud Investigation');
      cy.get('[data-testid="phone-input"]').clear().type('+1-555-9999');

      // Update role
      selectFromDropdown('role-select', 'fraud-investigator');

      // Update permissions
      cy.get('[data-testid="permission-fraud-investigation"]').check();
      cy.get('[data-testid="permission-case-escalate"]').check();
      cy.get('[data-testid="permission-external-reporting"]').check();

      cy.get('[data-testid="save-user-changes"]').click();
      cy.wait('@updateUser');

      checkNotification('User updated successfully', 'success');

      // Verify changes in user list
      cy.get('[data-testid="user-row"]').first().should('contain', 'Fraud Investigation');
      cy.get('[data-testid="user-role"]').first().should('contain', 'Fraud Investigator');
    });

    it('should deactivate and reactivate user accounts', () => {
      cy.get('[data-testid="user-row"]').first().within(() => {
        cy.get('[data-testid="user-actions-menu"]').click();
      });

      cy.get('[data-testid="deactivate-user"]').click();
      cy.get('[data-testid="deactivation-modal"]').should('be.visible');

      // Provide deactivation reason
      selectFromDropdown('deactivation-reason', 'employee-left');
      cy.get('[data-testid="deactivation-notes"]').type('Employee left the company - last day 2024-07-15');
      cy.get('[data-testid="transfer-cases-to"]').select(Cypress.env('testUsers').manager.email);

      cy.get('[data-testid="confirm-deactivation"]').click();
      cy.wait('@deactivateUser');

      checkNotification('User deactivated successfully', 'success');

      // Verify user status
      cy.get('[data-testid="user-status"]').first().should('contain', 'Inactive');
      cy.get('[data-testid="inactive-user-indicator"]').should('be.visible');

      // Reactivate user
      cy.get('[data-testid="user-row"]').first().within(() => {
        cy.get('[data-testid="user-actions-menu"]').click();
      });

      cy.get('[data-testid="reactivate-user"]').click();
      cy.get('[data-testid="reactivation-modal"]').should('be.visible');

      cy.get('[data-testid="reactivation-reason"]').type('Employee returned from leave');
      cy.get('[data-testid="confirm-reactivation"]').click();
      cy.wait('@reactivateUser');

      checkNotification('User reactivated successfully', 'success');
      cy.get('[data-testid="user-status"]').first().should('contain', 'Active');
    });

    it('should bulk manage users', () => {
      // Select multiple users
      cy.get('[data-testid="select-user-checkbox"]').eq(0).check();
      cy.get('[data-testid="select-user-checkbox"]').eq(1).check();
      cy.get('[data-testid="select-user-checkbox"]').eq(2).check();

      cy.get('[data-testid="bulk-actions-menu"]').click();
      cy.get('[data-testid="bulk-update-permissions"]').click();

      cy.get('[data-testid="bulk-permissions-modal"]').should('be.visible');

      // Apply bulk permission changes
      cy.get('[data-testid="add-permission-reports-view"]').check();
      cy.get('[data-testid="remove-permission-case-delete"]').check();

      cy.get('[data-testid="apply-bulk-changes"]').click();
      cy.wait('@bulkUpdateUsers');

      checkNotification('Bulk user update completed', 'success');

      // Verify changes applied
      cy.get('[data-testid="bulk-update-summary"]').should('be.visible');
      cy.get('[data-testid="users-updated-count"]').should('contain', '3');
    });
  });

  describe('Role-Based Access Control (RBAC)', () => {
    it('should create custom roles with specific permissions', () => {
      cy.visit('/admin/roles');
      waitForPageLoad();

      cy.get('[data-testid="create-role-button"]').click();
      cy.get('[data-testid="create-role-modal"]').should('be.visible');

      // Role basic information
      cy.get('[data-testid="role-name"]').type('Senior Medical Reviewer');
      cy.get('[data-testid="role-description"]').type('Senior reviewer with appeal handling capabilities');
      cy.get('[data-testid="role-category"]').select('medical-review');

      // Permission categories
      cy.get('[data-testid="permissions-section"]').should('be.visible');

      // Case management permissions
      cy.get('[data-testid="perm-case-view"]').check();
      cy.get('[data-testid="perm-case-edit"]').check();
      cy.get('[data-testid="perm-case-approve"]').check();
      cy.get('[data-testid="perm-case-deny"]').check();
      cy.get('[data-testid="perm-appeal-review"]').check();

      // Administrative permissions
      cy.get('[data-testid="perm-reports-generate"]').check();
      cy.get('[data-testid="perm-audit-trail-view"]').check();

      // Data access permissions
      cy.get('[data-testid="perm-phi-access"]').check();
      cy.get('[data-testid="perm-financial-data"]').check();

      // Workflow permissions
      cy.get('[data-testid="perm-assign-cases"]').check();
      cy.get('[data-testid="perm-escalate-cases"]').check();

      cy.get('[data-testid="create-role"]').click();
      cy.wait('@createRole');

      checkNotification('Role created successfully', 'success');

      // Verify role in list
      cy.get('[data-testid="role-row"]').should('contain', 'Senior Medical Reviewer');
    });

    it('should test permission inheritance and hierarchies', () => {
      cy.visit('/admin/roles');

      // Create parent role
      cy.get('[data-testid="create-role-button"]').click();
      cy.get('[data-testid="role-name"]').type('Base Reviewer');
      cy.get('[data-testid="perm-case-view"]').check();
      cy.get('[data-testid="perm-case-edit"]').check();
      cy.get('[data-testid="create-role"]').click();
      cy.wait('@createRole');

      // Create child role that inherits from parent
      cy.get('[data-testid="create-role-button"]').click();
      cy.get('[data-testid="role-name"]').type('Advanced Reviewer');
      cy.get('[data-testid="inherit-from-role"]').check();
      selectFromDropdown('parent-role', 'Base Reviewer');

      // Add additional permissions
      cy.get('[data-testid="perm-case-approve"]').check();
      cy.get('[data-testid="perm-case-deny"]').check();

      cy.get('[data-testid="create-role"]').click();
      cy.wait('@createRole');

      // Verify inheritance
      cy.get('[data-testid="role-row"]').contains('Advanced Reviewer').click();
      cy.get('[data-testid="inherited-permissions"]').should('be.visible');
      cy.get('[data-testid="inherited-perm-case-view"]').should('be.visible');
      cy.get('[data-testid="inherited-perm-case-edit"]').should('be.visible');
    });

    it('should enforce granular resource-level permissions', () => {
      cy.visit('/admin/permissions');
      waitForPageLoad();

      // Configure resource-level permissions
      cy.get('[data-testid="resource-permissions-tab"]').click();
      cy.get('[data-testid="configure-case-access"]').click();

      cy.get('[data-testid="access-modal"]').should('be.visible');

      // Department-level access
      cy.get('[data-testid="access-level-department"]').check();
      cy.get('[data-testid="department-cardiology"]').check();
      cy.get('[data-testid="department-orthopedics"]').check();

      // Case type restrictions
      cy.get('[data-testid="case-type-restrictions"]').should('be.visible');
      cy.get('[data-testid="case-type-pre-auth"]').check();
      cy.get('[data-testid="case-type-appeals"]').uncheck();

      // Financial thresholds
      cy.get('[data-testid="financial-access-limits"]').should('be.visible');
      cy.get('[data-testid="max-case-value"]').type('50000');
      cy.get('[data-testid="require-approval-above"]').type('25000');

      cy.get('[data-testid="save-resource-permissions"]').click();
      cy.wait('@saveResourcePermissions');

      checkNotification('Resource permissions configured', 'success');
    });

    it('should validate permission enforcement in real scenarios', () => {
      // Test as regular auditor (limited permissions)
      cy.logout();
      cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);

      cy.visit('/cases');
      waitForPageLoad();

      // Should be able to view cases
      cy.get('[data-testid="cases-table"]').should('be.visible');

      // Should NOT be able to delete cases
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="delete-case-button"]').should('not.exist');

      // Should NOT be able to access admin functions
      cy.visit('/admin/users');
      cy.get('[data-testid="access-denied-message"]').should('be.visible');
      cy.url().should('not.include', '/admin/users');

      // Test high-value case restriction
      cy.visit('/cases');
      cy.createCase({
        title: 'High Value Case',
        claimAmount: 75000, // Above threshold
      });

      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="approve-case-button"]').should('be.disabled');
      cy.get('[data-testid="approval-requires-manager"]').should('be.visible');
    });

    it('should handle dynamic permission updates', () => {
      // Update user permissions in real-time
      cy.visit('/admin/users');
      cy.get('[data-testid="user-row"]').first().within(() => {
        cy.get('[data-testid="edit-user-button"]').click();
      });

      // Add new permission
      cy.get('[data-testid="permission-case-delete"]').check();
      cy.get('[data-testid="save-user-changes"]').click();
      cy.wait('@updateUser');

      // Test that user immediately has new permission
      cy.logout();
      cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);

      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      // Should now see delete button
      cy.get('[data-testid="delete-case-button"]').should('be.visible');

      // Remove permission and verify immediate effect
      cy.logout();
      cy.login(Cypress.env('testUsers').admin.email, Cypress.env('testUsers').admin.password);
      cy.visit('/admin/users');

      cy.get('[data-testid="user-row"]').first().within(() => {
        cy.get('[data-testid="edit-user-button"]').click();
      });

      cy.get('[data-testid="permission-case-delete"]').uncheck();
      cy.get('[data-testid="save-user-changes"]').click();
      cy.wait('@updateUser');

      // Verify permission removed immediately
      cy.logout();
      cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);

      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="delete-case-button"]').should('not.exist');
    });
  });

  describe('Security and Compliance', () => {
    it('should enforce password policies', () => {
      cy.visit('/admin/users');
      cy.get('[data-testid="create-user-button"]').click();

      fillForm({
        'first-name': 'Test',
        'last-name': 'User',
        'email': 'test.user@austa.com',
      });

      // Test weak password rejection
      cy.get('[data-testid="password-input"]').type('weak');
      cy.get('[data-testid="password-strength"]').should('contain', 'Weak');
      cy.get('[data-testid="password-error"]').should('contain', 'Password must be at least 12 characters');

      // Test password without special characters
      cy.get('[data-testid="password-input"]').clear().type('Password123');
      cy.get('[data-testid="password-error"]').should('contain', 'Must contain special characters');

      // Test strong password
      cy.get('[data-testid="password-input"]').clear().type('StrongPassword123!@#');
      cy.get('[data-testid="password-strength"]').should('contain', 'Strong');
      cy.get('[data-testid="password-error"]').should('not.exist');
    });

    it('should enforce session management policies', () => {
      // Test session timeout
      cy.visit('/admin/security');
      cy.get('[data-testid="session-timeout"]').clear().type('30'); // 30 minutes
      cy.get('[data-testid="save-security-settings"]').click();
      cy.wait('@saveSecuritySettings');

      // Test concurrent session limits
      cy.get('[data-testid="max-concurrent-sessions"]').clear().type('2');
      cy.get('[data-testid="force-logout-on-limit"]').check();
      cy.get('[data-testid="save-security-settings"]').click();
      cy.wait('@saveSecuritySettings');

      checkNotification('Security settings updated', 'success');
    });

    it('should audit user activities', () => {
      cy.visit('/admin/audit-logs');
      waitForPageLoad();

      // Filter audit logs by user
      cy.get('[data-testid="user-filter"]').type(Cypress.env('testUsers').auditor.email);
      cy.get('[data-testid="apply-filter"]').click();
      cy.wait('@getAuditLogs');

      // Verify audit entries
      cy.get('[data-testid="audit-log-row"]').should('have.length.at.least', 1);
      cy.get('[data-testid="audit-action"]').should('be.visible');
      cy.get('[data-testid="audit-timestamp"]').should('be.visible');
      cy.get('[data-testid="audit-ip-address"]').should('be.visible');

      // View detailed audit entry
      cy.get('[data-testid="audit-log-row"]').first().click();
      cy.get('[data-testid="audit-details-modal"]').should('be.visible');
      cy.get('[data-testid="audit-before-state"]').should('be.visible');
      cy.get('[data-testid="audit-after-state"]').should('be.visible');
    });

    it('should handle data privacy and HIPAA compliance', () => {
      cy.visit('/admin/privacy-settings');

      // Configure data retention policies
      cy.get('[data-testid="audit-log-retention"]').clear().type('2555'); // 7 years
      cy.get('[data-testid="user-data-retention"]').clear().type('2555');
      cy.get('[data-testid="case-data-retention"]').clear().type('3650'); // 10 years

      // PHI access controls
      cy.get('[data-testid="phi-access-logging"]').check();
      cy.get('[data-testid="phi-access-approval"]').check();
      cy.get('[data-testid="phi-minimum-necessary"]').check();

      // Data breach notification settings
      cy.get('[data-testid="breach-notification-enabled"]').check();
      cy.get('[data-testid="breach-notification-email"]').type('privacy-officer@austa.com');
      cy.get('[data-testid="breach-notification-threshold"]').type('10'); // 10 records

      cy.get('[data-testid="save-privacy-settings"]').click();
      cy.wait('@savePrivacySettings');

      checkNotification('Privacy settings updated', 'success');
    });
  });

  describe('Access Request and Approval Workflow', () => {
    it('should request elevated permissions', () => {
      cy.logout();
      cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);

      cy.visit('/profile/access-requests');
      cy.get('[data-testid="request-access-button"]').click();

      cy.get('[data-testid="access-request-modal"]').should('be.visible');

      // Request specific permissions
      cy.get('[data-testid="requested-permission-case-approve"]').check();
      cy.get('[data-testid="requested-permission-high-value-cases"]').check();

      // Justification
      cy.get('[data-testid="access-justification"]').type('Need approval permissions to handle increased caseload during colleague absence');

      // Request duration
      cy.get('[data-testid="access-duration"]').select('30-days');
      cy.get('[data-testid="access-end-date"]').type('2024-08-15');

      cy.get('[data-testid="submit-access-request"]').click();
      cy.wait('@submitAccessRequest');

      checkNotification('Access request submitted for approval', 'success');
    });

    it('should approve access requests as manager', () => {
      cy.logout();
      cy.login(Cypress.env('testUsers').manager.email, Cypress.env('testUsers').manager.password);

      cy.visit('/admin/access-requests');
      waitForPageLoad();

      // View pending requests
      cy.get('[data-testid="pending-requests-tab"]').click();
      cy.get('[data-testid="request-row"]').should('have.length.at.least', 1);

      // Review request details
      cy.get('[data-testid="request-row"]').first().click();
      cy.get('[data-testid="request-details-modal"]').should('be.visible');

      cy.get('[data-testid="requester-info"]').should('be.visible');
      cy.get('[data-testid="requested-permissions"]').should('be.visible');
      cy.get('[data-testid="justification-text"]').should('be.visible');

      // Approve with conditions
      cy.get('[data-testid="approve-request"]').click();
      cy.get('[data-testid="approval-conditions"]').type('Approved for 30 days. Must provide weekly status updates.');
      cy.get('[data-testid="confirm-approval"]').click();
      cy.wait('@approveAccessRequest');

      checkNotification('Access request approved', 'success');
    });

    it('should auto-revoke temporary permissions', () => {
      // Simulate time passage to trigger auto-revocation
      cy.task('queryDatabase', {
        sql: 'UPDATE access_grants SET end_date = NOW() - INTERVAL \'1 day\' WHERE user_id = $1',
        params: [Cypress.env('testUsers').auditor.id]
      });

      // Run cleanup process
      cy.request('POST', `${Cypress.env('apiUrl')}/admin/cleanup-expired-access`);

      // Verify permissions revoked
      cy.logout();
      cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);

      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      // Should no longer have approval permissions
      cy.get('[data-testid="approve-case-button"]').should('not.exist');
      cy.get('[data-testid="temporary-access-expired"]').should('be.visible');
    });
  });

  describe('Multi-Factor Authentication Management', () => {
    it('should configure MFA requirements by role', () => {
      cy.visit('/admin/mfa-settings');

      // Configure MFA requirements
      cy.get('[data-testid="role-admin-mfa"]').check();
      cy.get('[data-testid="role-manager-mfa"]').check();
      cy.get('[data-testid="role-auditor-mfa"]').uncheck();

      // MFA methods
      cy.get('[data-testid="allow-sms-mfa"]').check();
      cy.get('[data-testid="allow-app-mfa"]').check();
      cy.get('[data-testid="allow-hardware-token"]').check();

      // Backup codes
      cy.get('[data-testid="backup-codes-enabled"]').check();
      cy.get('[data-testid="backup-codes-count"]').clear().type('10');

      cy.get('[data-testid="save-mfa-settings"]').click();
      cy.wait('@saveMFASettings');

      checkNotification('MFA settings updated', 'success');
    });

    it('should enforce MFA enrollment for required roles', () => {
      // Update user to admin role (requires MFA)
      cy.get('[data-testid="user-row"]').contains(Cypress.env('testUsers').auditor.email).within(() => {
        cy.get('[data-testid="edit-user-button"]').click();
      });

      selectFromDropdown('role-select', 'admin');
      cy.get('[data-testid="save-user-changes"]').click();
      cy.wait('@updateUser');

      // Login as updated user - should be forced to set up MFA
      cy.logout();
      cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);

      // Should be redirected to MFA setup
      cy.url().should('include', '/mfa-setup');
      cy.get('[data-testid="mfa-setup-required"]').should('be.visible');
      cy.get('[data-testid="mfa-setup-instructions"]').should('be.visible');
    });
  });
});