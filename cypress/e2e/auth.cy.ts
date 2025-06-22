describe('Authentication Flow', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  describe('Login', () => {
    it('should display login form', () => {
      cy.visit('/login');
      cy.get('form').should('be.visible');
      cy.get('#email').should('be.visible');
      cy.get('#password').should('be.visible');
      cy.get('button[type="submit"]').should('be.visible');
    });

    it('should show validation errors for empty fields', () => {
      cy.visit('/login');
      cy.get('button[type="submit"]').click();
      
      // Check HTML5 validation
      cy.get('#email:invalid').should('exist');
      cy.get('#password:invalid').should('exist');
    });

    it('should show error for invalid credentials', () => {
      cy.visit('/login');
      cy.get('#email').type('wrong@example.com');
      cy.get('#password').type('wrongpassword');
      cy.get('button[type="submit"]').click();
      
      cy.get('.text-red-800')
        .should('be.visible')
        .and('contain', 'Invalid credentials');
    });

    it('should successfully login with valid credentials', () => {
      cy.visit('/login');
      cy.get('#email').type('test@example.com');
      cy.get('#password').type('TestPassword123!');
      cy.get('button[type="submit"]').click();
      
      // Should redirect to dashboard
      cy.url().should('include', '/dashboard');
      cy.get('h1').should('contain', 'Dashboard');
      
      // Should store auth token
      cy.window().its('localStorage.token').should('exist');
    });

    it('should redirect to originally requested page after login', () => {
      // Try to access protected route
      cy.visit('/cases');
      
      // Should redirect to login
      cy.url().should('include', '/login');
      
      // Login
      cy.get('#email').type('test@example.com');
      cy.get('#password').type('TestPassword123!');
      cy.get('button[type="submit"]').click();
      
      // Should redirect back to cases
      cy.url().should('include', '/cases');
    });
  });

  describe('Logout', () => {
    beforeEach(() => {
      cy.login('test@example.com', 'TestPassword123!');
      cy.visit('/dashboard');
    });

    it('should successfully logout', () => {
      cy.get('[aria-label="User menu"], .user-menu, button:contains("Logout")').first().click();
      
      // Should redirect to login
      cy.url().should('include', '/login');
      
      // Should clear auth token
      cy.window().its('localStorage.token').should('not.exist');
      
      // Should not be able to access protected routes
      cy.visit('/dashboard');
      cy.url().should('include', '/login');
    });
  });

  describe('Session Management', () => {
    it('should maintain session across page refreshes', () => {
      cy.login('test@example.com', 'TestPassword123!');
      cy.visit('/dashboard');
      
      // Refresh page
      cy.reload();
      
      // Should still be logged in
      cy.url().should('include', '/dashboard');
      cy.get('[data-testid="user-menu"]').should('be.visible');
    });

    it('should handle expired session', () => {
      cy.login('test@example.com', 'TestPassword123!');
      cy.visit('/dashboard');
      
      // Simulate expired token
      cy.window().then((win) => {
        win.localStorage.setItem('authToken', 'expired-token');
      });
      
      // Try to make an API call
      cy.get('[data-testid="refresh-button"]').click();
      
      // Should redirect to login
      cy.url().should('include', '/login');
      cy.get('[data-testid="notification-error"]')
        .should('contain', 'Session expired');
    });
  });

  describe('Password Reset', () => {
    it('should navigate to password reset page', () => {
      cy.visit('/login');
      cy.get('[data-testid="forgot-password-link"]').click();
      cy.url().should('include', '/reset-password');
    });

    it('should validate email format', () => {
      cy.visit('/reset-password');
      cy.get('[data-testid="email-input"]').type('invalid-email');
      cy.get('[data-testid="reset-button"]').click();
      
      cy.get('[data-testid="email-error"]')
        .should('be.visible')
        .and('contain', 'Please enter a valid email address');
    });

    it('should send password reset email', () => {
      cy.visit('/reset-password');
      cy.get('[data-testid="email-input"]').type('test@example.com');
      cy.get('[data-testid="reset-button"]').click();
      
      cy.get('[data-testid="notification-success"]')
        .should('be.visible')
        .and('contain', 'Password reset email sent');
    });

    it('should handle password reset with token', () => {
      const resetToken = 'test-reset-token-123';
      cy.visit(`/reset-password/${resetToken}`);
      
      cy.get('[data-testid="new-password-input"]').type('NewPassword123!');
      cy.get('[data-testid="confirm-password-input"]').type('NewPassword123!');
      cy.get('[data-testid="reset-password-button"]').click();
      
      cy.get('[data-testid="notification-success"]')
        .should('be.visible')
        .and('contain', 'Password reset successfully');
      
      cy.url().should('include', '/login');
    });

    it('should validate password strength', () => {
      const resetToken = 'test-reset-token-123';
      cy.visit(`/reset-password/${resetToken}`);
      
      cy.get('[data-testid="new-password-input"]').type('weak');
      cy.get('[data-testid="reset-password-button"]').click();
      
      cy.get('[data-testid="password-error"]')
        .should('be.visible')
        .and('contain', 'Password must be at least 8 characters');
    });

    it('should validate password confirmation', () => {
      const resetToken = 'test-reset-token-123';
      cy.visit(`/reset-password/${resetToken}`);
      
      cy.get('[data-testid="new-password-input"]').type('NewPassword123!');
      cy.get('[data-testid="confirm-password-input"]').type('DifferentPassword123!');
      cy.get('[data-testid="reset-password-button"]').click();
      
      cy.get('[data-testid="confirm-password-error"]')
        .should('be.visible')
        .and('contain', 'Passwords do not match');
    });

    it('should handle expired reset token', () => {
      const expiredToken = 'expired-reset-token';
      cy.visit(`/reset-password/${expiredToken}`);
      
      cy.get('[data-testid="notification-error"]')
        .should('be.visible')
        .and('contain', 'Reset token has expired');
    });
  });

  describe('Multi-Factor Authentication (MFA)', () => {
    beforeEach(() => {
      cy.visit('/login');
    });

    it('should prompt for MFA after valid credentials', () => {
      cy.get('#email').type('mfa-user@example.com');
      cy.get('#password').type('Password123!');
      cy.get('button[type="submit"]').click();
      
      // MFA form should be visible (same page, different form)
      cy.get('#mfaToken').should('be.visible');
      cy.contains('Two-Factor Authentication').should('be.visible');
    });

    it('should verify MFA code successfully', () => {
      cy.get('#email').type('mfa-user@example.com');
      cy.get('#password').type('Password123!');
      cy.get('button[type="submit"]').click();
      
      cy.get('#mfaToken').type('123456');
      cy.get('button:contains("Verify")').click();
      
      cy.url().should('include', '/dashboard');
      cy.get('h1').should('contain', 'Dashboard');
    });

    it('should handle invalid MFA code', () => {
      cy.get('#email').type('mfa-user@example.com');
      cy.get('#password').type('Password123!');
      cy.get('button[type="submit"]').click();
      
      cy.get('#mfaToken').type('000000');
      cy.get('button:contains("Verify")').click();
      
      cy.get('.text-red-800')
        .should('be.visible')
        .and('contain', 'Invalid verification code');
    });

    it('should resend MFA code', () => {
      cy.get('[data-testid="email-input"]').type('mfa-user@example.com');
      cy.get('[data-testid="password-input"]').type('Password123!');
      cy.get('[data-testid="login-button"]').click();
      
      cy.get('[data-testid="resend-code-button"]').click();
      
      cy.get('[data-testid="notification-success"]')
        .should('be.visible')
        .and('contain', 'Verification code sent');
    });

    it('should handle MFA timeout', () => {
      cy.get('[data-testid="email-input"]').type('mfa-user@example.com');
      cy.get('[data-testid="password-input"]').type('Password123!');
      cy.get('[data-testid="login-button"]').click();
      
      // Wait for MFA timeout (simulate)
      cy.wait(30000);
      
      cy.get('[data-testid="verify-mfa-button"]').click();
      
      cy.get('[data-testid="notification-error"]')
        .should('be.visible')
        .and('contain', 'Verification session expired');
    });

    it('should allow backup code usage', () => {
      cy.get('[data-testid="email-input"]').type('mfa-user@example.com');
      cy.get('[data-testid="password-input"]').type('Password123!');
      cy.get('[data-testid="login-button"]').click();
      
      cy.get('[data-testid="use-backup-code-link"]').click();
      cy.get('[data-testid="backup-code-input"]').type('backup-code-123');
      cy.get('[data-testid="verify-backup-code-button"]').click();
      
      cy.url().should('include', '/dashboard');
    });
  });

  describe('Account Lockout', () => {
    it('should lock account after multiple failed attempts', () => {
      cy.visit('/login');
      
      // Attempt multiple failed logins
      for (let i = 0; i < 5; i++) {
        cy.get('[data-testid="email-input"]').clear().type('test@example.com');
        cy.get('[data-testid="password-input"]').clear().type('wrongpassword');
        cy.get('[data-testid="login-button"]').click();
        cy.wait(1000);
      }
      
      cy.get('[data-testid="notification-error"]')
        .should('be.visible')
        .and('contain', 'Account temporarily locked');
      
      cy.get('[data-testid="login-button"]').should('be.disabled');
    });

    it('should show lockout countdown', () => {
      cy.visit('/login');
      
      // Trigger account lockout
      for (let i = 0; i < 5; i++) {
        cy.get('[data-testid="email-input"]').clear().type('test@example.com');
        cy.get('[data-testid="password-input"]').clear().type('wrongpassword');
        cy.get('[data-testid="login-button"]').click();
        cy.wait(1000);
      }
      
      cy.get('[data-testid="lockout-timer"]').should('be.visible');
      cy.get('[data-testid="lockout-timer"]').should('contain', 'minutes');
    });
  });

  describe('Social Authentication', () => {
    it('should redirect to Google OAuth', () => {
      cy.visit('/login');
      cy.get('[data-testid="google-login-button"]').click();
      
      cy.origin('https://accounts.google.com', () => {
        cy.url().should('include', 'accounts.google.com');
      });
    });

    it('should redirect to Microsoft OAuth', () => {
      cy.visit('/login');
      cy.get('[data-testid="microsoft-login-button"]').click();
      
      cy.origin('https://login.microsoftonline.com', () => {
        cy.url().should('include', 'login.microsoftonline.com');
      });
    });
  });

  describe('Security Headers', () => {
    it('should have proper security headers', () => {
      cy.visit('/login');
      cy.request('/login').then((response) => {
        expect(response.headers).to.have.property('x-content-type-options', 'nosniff');
        expect(response.headers).to.have.property('x-frame-options', 'DENY');
        expect(response.headers).to.have.property('x-xss-protection', '1; mode=block');
      });
    });
  });
});