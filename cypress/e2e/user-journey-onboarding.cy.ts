import { selectFromDropdown, checkNotification, fillForm } from '../support/commands';

describe('New User Onboarding Journey', () => {
  beforeEach(() => {
    cy.cleanupDatabase();
    cy.visit('/');
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Complete User Registration Flow', () => {
    it('should complete full registration and onboarding process', () => {
      // Navigate to registration
      cy.visit('/register');
      cy.get('[data-testid="registration-form"]').should('be.visible');

      // Fill registration form
      const userData = {
        'first-name': 'Jane',
        'last-name': 'Smith',
        'email': 'jane.smith@test.com',
        'password': 'SecurePass123!',
        'confirm-password': 'SecurePass123!',
        'phone': '+1-555-0123',
        'organization': 'Test Medical Center',
      };

      fillForm(userData);

      // Select role
      selectFromDropdown('role-select', 'auditor');

      // Accept terms and conditions
      cy.get('[data-testid="terms-checkbox"]').check();
      cy.get('[data-testid="privacy-checkbox"]').check();

      // Submit registration
      cy.get('[data-testid="register-button"]').click();
      cy.wait('@registerUser');

      // Verify email confirmation message
      checkNotification('Registration successful! Please check your email to verify your account.', 'success');
      cy.get('[data-testid="email-verification-notice"]').should('be.visible');

      // Simulate email verification (in real test, this would be done via API)
      cy.task('verifyUserEmail', { email: userData.email });

      // Navigate to login and complete first login
      cy.visit('/login');
      cy.get('[data-testid="email-input"]').type(userData.email);
      cy.get('[data-testid="password-input"]').type(userData.password);
      cy.get('[data-testid="login-button"]').click();

      // Check for first-time setup wizard
      cy.get('[data-testid="onboarding-wizard"]').should('be.visible');
      
      // Step 1: Profile completion
      cy.get('[data-testid="wizard-step-1"]').should('have.class', 'active');
      cy.get('[data-testid="profile-photo-upload"]').should('be.visible');
      cy.get('[data-testid="bio-input"]').type('Experienced medical auditor with 5+ years in healthcare quality control.');
      cy.get('[data-testid="specialization-select"]').click();
      cy.get('[data-testid="specialization-cardiology"]').click();
      cy.get('[data-testid="wizard-next"]').click();

      // Step 2: Security setup
      cy.get('[data-testid="wizard-step-2"]').should('have.class', 'active');
      cy.get('[data-testid="mfa-setup-option"]').should('be.visible');
      cy.get('[data-testid="enable-mfa-checkbox"]').check();
      
      // MFA QR code should appear
      cy.get('[data-testid="mfa-qr-code"]').should('be.visible');
      cy.get('[data-testid="mfa-backup-codes"]').should('be.visible');
      
      // Simulate MFA verification
      cy.get('[data-testid="mfa-verification-code"]').type('123456');
      cy.get('[data-testid="verify-mfa"]').click();
      checkNotification('MFA enabled successfully', 'success');
      cy.get('[data-testid="wizard-next"]').click();

      // Step 3: Preferences
      cy.get('[data-testid="wizard-step-3"]').should('have.class', 'active');
      selectFromDropdown('theme-preference', 'light');
      selectFromDropdown('language-preference', 'en');
      cy.get('[data-testid="notification-email"]').check();
      cy.get('[data-testid="notification-sms"]').check();
      cy.get('[data-testid="wizard-next"]').click();

      // Step 4: Tour
      cy.get('[data-testid="wizard-step-4"]').should('have.class', 'active');
      cy.get('[data-testid="start-tour"]').click();

      // Guided tour steps
      cy.get('[data-testid="tour-tooltip"]').should('be.visible');
      cy.get('[data-testid="tour-tooltip"]').should('contain', 'Welcome to the dashboard');
      cy.get('[data-testid="tour-next"]').click();

      cy.get('[data-testid="tour-tooltip"]').should('contain', 'Here you can view your pending cases');
      cy.get('[data-testid="tour-next"]').click();

      cy.get('[data-testid="tour-tooltip"]').should('contain', 'Access all cases from the sidebar');
      cy.get('[data-testid="tour-next"]').click();

      cy.get('[data-testid="tour-tooltip"]').should('contain', 'Your profile and settings');
      cy.get('[data-testid="tour-finish"]').click();

      // Complete onboarding
      cy.get('[data-testid="wizard-complete"]').click();
      checkNotification('Welcome to AUSTA Cockpit! Your account is now set up.', 'success');

      // Verify user is now on dashboard with proper setup
      cy.url().should('include', '/dashboard');
      cy.get('[data-testid="welcome-message"]').should('contain', 'Welcome, Jane');
      cy.get('[data-testid="user-avatar"]').should('be.visible');
      cy.get('[data-testid="mfa-enabled-indicator"]').should('be.visible');

      // Verify role-based features are available
      cy.get('[data-testid="auditor-features"]').should('be.visible');
      cy.get('[data-testid="sidebar-cases"]').should('be.visible');
      cy.get('[data-testid="sidebar-analytics"]').should('be.visible');

      // Admin features should not be visible
      cy.get('[data-testid="admin-features"]').should('not.exist');
    });

    it('should handle registration validation errors gracefully', () => {
      cy.visit('/register');

      // Submit empty form
      cy.get('[data-testid="register-button"]').click();

      // Check all field validations
      cy.get('[data-testid="first-name-error"]').should('contain', 'First name is required');
      cy.get('[data-testid="last-name-error"]').should('contain', 'Last name is required');
      cy.get('[data-testid="email-error"]').should('contain', 'Email is required');
      cy.get('[data-testid="password-error"]').should('contain', 'Password is required');

      // Test password strength validation
      cy.get('[data-testid="password-input"]').type('weak');
      cy.get('[data-testid="password-input"]').blur();
      cy.get('[data-testid="password-error"]').should('contain', 'Password must be at least 8 characters');

      // Test password confirmation mismatch
      cy.get('[data-testid="password-input"]').clear().type('SecurePass123!');
      cy.get('[data-testid="confirm-password-input"]').type('DifferentPass123!');
      cy.get('[data-testid="confirm-password-input"]').blur();
      cy.get('[data-testid="confirm-password-error"]').should('contain', 'Passwords do not match');

      // Test email format validation
      cy.get('[data-testid="email-input"]').type('invalid-email');
      cy.get('[data-testid="email-input"]').blur();
      cy.get('[data-testid="email-error"]').should('contain', 'Please enter a valid email address');

      // Test duplicate email
      cy.get('[data-testid="email-input"]').clear().type('existing@test.com');
      cy.get('[data-testid="first-name-input"]').type('John');
      cy.get('[data-testid="last-name-input"]').type('Doe');
      cy.get('[data-testid="password-input"]').clear().type('SecurePass123!');
      cy.get('[data-testid="confirm-password-input"]').clear().type('SecurePass123!');
      cy.get('[data-testid="terms-checkbox"]').check();
      cy.get('[data-testid="register-button"]').click();

      // Should show duplicate email error
      checkNotification('Email address is already registered', 'error');
    });

    it('should allow skipping MFA setup during onboarding', () => {
      // Complete registration first
      cy.task('createTestUser', {
        email: 'test.user@example.com',
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User',
        verified: true,
      });

      // Login
      cy.visit('/login');
      cy.get('[data-testid="email-input"]').type('test.user@example.com');
      cy.get('[data-testid="password-input"]').type('SecurePass123!');
      cy.get('[data-testid="login-button"]').click();

      // Navigate through onboarding wizard
      cy.get('[data-testid="onboarding-wizard"]').should('be.visible');
      
      // Skip profile step
      cy.get('[data-testid="wizard-skip"]').click();

      // Security setup - choose to skip MFA
      cy.get('[data-testid="skip-mfa"]').click();
      cy.get('[data-testid="mfa-skip-confirmation"]').should('be.visible');
      cy.get('[data-testid="confirm-skip-mfa"]').click();
      cy.get('[data-testid="wizard-next"]').click();

      // Skip preferences
      cy.get('[data-testid="wizard-skip"]').click();

      // Skip tour
      cy.get('[data-testid="wizard-skip"]').click();

      // Complete onboarding
      cy.get('[data-testid="wizard-complete"]').click();

      // Verify on dashboard without MFA
      cy.url().should('include', '/dashboard');
      cy.get('[data-testid="mfa-enabled-indicator"]').should('not.exist');
      cy.get('[data-testid="security-recommendation"]').should('contain', 'Enable MFA for better security');
    });
  });

  describe('Role-Based Onboarding Experience', () => {
    it('should customize onboarding for different user roles', () => {
      // Test Admin role onboarding
      cy.task('createTestUser', {
        email: 'admin@test.com',
        password: 'AdminPass123!',
        role: 'admin',
        verified: true,
      });

      cy.visit('/login');
      cy.get('[data-testid="email-input"]').type('admin@test.com');
      cy.get('[data-testid="password-input"]').type('AdminPass123!');
      cy.get('[data-testid="login-button"]').click();

      // Admin-specific onboarding content
      cy.get('[data-testid="admin-onboarding"]').should('be.visible');
      cy.get('[data-testid="admin-tour-users"]').should('be.visible');
      cy.get('[data-testid="admin-tour-settings"]').should('be.visible');
      cy.get('[data-testid="admin-tour-analytics"]').should('be.visible');

      // Complete admin tour
      cy.get('[data-testid="start-admin-tour"]').click();
      cy.get('[data-testid="tour-tooltip"]').should('contain', 'Manage users and permissions');
      cy.get('[data-testid="tour-finish"]').click();

      // Verify admin features are available
      cy.get('[data-testid="admin-features"]').should('be.visible');
      cy.get('[data-testid="user-management"]').should('be.visible');
      cy.get('[data-testid="system-settings"]').should('be.visible');
    });

    it('should show appropriate features for auditor role', () => {
      cy.task('createTestUser', {
        email: 'auditor@test.com',
        password: 'AuditorPass123!',
        role: 'auditor',
        verified: true,
      });

      cy.visit('/login');
      cy.get('[data-testid="email-input"]').type('auditor@test.com');
      cy.get('[data-testid="password-input"]').type('AuditorPass123!');
      cy.get('[data-testid="login-button"]').click();

      // Skip onboarding to check final state
      cy.get('[data-testid="skip-onboarding"]').click();

      // Verify auditor-specific features
      cy.get('[data-testid="auditor-features"]').should('be.visible');
      cy.get('[data-testid="cases-section"]').should('be.visible');
      cy.get('[data-testid="audit-tools"]').should('be.visible');

      // Admin features should not be visible
      cy.get('[data-testid="admin-features"]').should('not.exist');
      cy.get('[data-testid="user-management"]').should('not.exist');
    });
  });

  describe('Accessibility During Onboarding', () => {
    it('should be fully accessible via keyboard navigation', () => {
      cy.visit('/register');

      // Navigate form using only keyboard
      cy.tab();
      cy.focused().should('have.attr', 'data-testid', 'first-name-input');
      
      cy.focused().type('John');
      cy.tab();
      cy.focused().should('have.attr', 'data-testid', 'last-name-input');
      
      cy.focused().type('Doe');
      cy.tab();
      cy.focused().should('have.attr', 'data-testid', 'email-input');
      
      cy.focused().type('john.doe@test.com');
      cy.tab();
      cy.focused().should('have.attr', 'data-testid', 'password-input');

      // Test form submission via keyboard
      cy.get('[data-testid="register-button"]').focus().type('{enter}');
    });

    it('should have proper ARIA labels and announcements', () => {
      cy.visit('/register');
      
      // Check ARIA labels
      cy.get('[data-testid="registration-form"]').should('have.attr', 'aria-label', 'User registration form');
      cy.get('[data-testid="first-name-input"]').should('have.attr', 'aria-required', 'true');
      cy.get('[data-testid="password-input"]').should('have.attr', 'aria-describedby');
      
      // Check error announcements
      cy.get('[data-testid="register-button"]').click();
      cy.get('[data-testid="first-name-error"]').should('have.attr', 'role', 'alert');
      cy.get('[data-testid="first-name-error"]').should('have.attr', 'aria-live', 'polite');
    });
  });
});