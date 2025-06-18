import { waitForPageLoad } from '../support/commands';

describe('Visual Regression Testing', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Page-Level Visual Tests', () => {
    it('should maintain consistent login page appearance', () => {
      cy.logout();
      cy.visit('/login');
      waitForPageLoad();

      // Wait for fonts and images to load
      cy.get('[data-testid="login-form"]').should('be.visible');
      cy.wait(1000); // Allow time for fonts to load

      cy.compareSnapshot('login-page', {
        threshold: 0.2,
        thresholdType: 'percent'
      });
    });

    it('should maintain consistent dashboard appearance', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Ensure all charts and data are loaded
      cy.get('[data-testid="kpi-cards"]').should('be.visible');
      cy.get('[data-testid="chart-loading"]').should('not.exist');
      cy.wait(2000); // Allow time for charts to render

      cy.compareSnapshot('dashboard-overview', {
        threshold: 0.3,
        thresholdType: 'percent'
      });
    });

    it('should maintain consistent cases list appearance', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Wait for table data to load
      cy.get('[data-testid="cases-table"]').should('be.visible');
      cy.get('[data-testid="case-row"]').should('have.length.at.least', 1);
      cy.wait(1000);

      cy.compareSnapshot('cases-list', {
        threshold: 0.2,
        thresholdType: 'percent'
      });
    });

    it('should maintain consistent case details appearance', () => {
      cy.visit('/cases');
      waitForPageLoad();
      
      cy.get('[data-testid="case-row"]').first().click();
      waitForPageLoad();

      // Ensure all tabs and content are loaded
      cy.get('[data-testid="case-details"]').should('be.visible');
      cy.get('[data-testid="case-info-loaded"]').should('be.visible');
      cy.wait(1000);

      cy.compareSnapshot('case-details', {
        threshold: 0.25,
        thresholdType: 'percent'
      });
    });

    it('should maintain consistent analytics dashboard appearance', () => {
      cy.visit('/analytics');
      waitForPageLoad();

      // Wait for all charts to render
      cy.get('[data-testid="analytics-dashboard"]').should('be.visible');
      cy.get('[data-testid="chart-loading"]').should('not.exist');
      cy.get('[data-testid="kpi-total-cases"]').should('be.visible');
      cy.wait(3000); // Charts need more time to render

      cy.compareSnapshot('analytics-dashboard', {
        threshold: 0.4,
        thresholdType: 'percent'
      });
    });
  });

  describe('Component-Level Visual Tests', () => {
    it('should maintain navigation component appearance', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.get('[data-testid="main-navigation"]').compareSnapshot('main-navigation', {
        threshold: 0.1,
        thresholdType: 'percent'
      });
    });

    it('should maintain header component appearance', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.get('[data-testid="page-header"]').compareSnapshot('page-header', {
        threshold: 0.15,
        thresholdType: 'percent'
      });
    });

    it('should maintain modal dialog appearance', () => {
      cy.visit('/cases');
      waitForPageLoad();

      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="create-case-modal"]').should('be.visible');
      cy.wait(500);

      cy.get('[data-testid="create-case-modal"]').compareSnapshot('create-case-modal', {
        threshold: 0.1,
        thresholdType: 'percent'
      });
    });

    it('should maintain form component appearance', () => {
      cy.visit('/cases');
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="create-case-modal"]').should('be.visible');
      
      // Fill some fields to show different states
      cy.get('[data-testid="title-input"]').type('Visual Test Case');
      cy.get('[data-testid="priority-select"]').select('high');
      cy.wait(500);

      cy.get('[data-testid="case-form"]').compareSnapshot('case-form-filled', {
        threshold: 0.1,
        thresholdType: 'percent'
      });
    });

    it('should maintain data table appearance', () => {
      cy.visit('/cases');
      waitForPageLoad();

      cy.get('[data-testid="cases-table"]').compareSnapshot('cases-table', {
        threshold: 0.2,
        thresholdType: 'percent'
      });
    });

    it('should maintain chart components appearance', () => {
      cy.visit('/analytics');
      waitForPageLoad();

      // Test individual chart components
      cy.get('[data-testid="case-volume-chart"]').should('be.visible');
      cy.wait(2000);

      cy.get('[data-testid="case-volume-chart"]').compareSnapshot('case-volume-chart', {
        threshold: 0.3,
        thresholdType: 'percent'
      });

      cy.get('[data-testid="approval-rate-chart"]').compareSnapshot('approval-rate-chart', {
        threshold: 0.3,
        thresholdType: 'percent'
      });
    });
  });

  describe('State-Based Visual Tests', () => {
    it('should maintain appearance of different case statuses', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Filter by different statuses and capture
      const statuses = ['pending', 'under_review', 'approved', 'denied'];

      statuses.forEach((status) => {
        cy.get('[data-testid="status-filter"]').click();
        cy.get(`[data-testid="status-option-${status}"]`).click();
        cy.wait(1000);

        cy.get('[data-testid="cases-table"]').compareSnapshot(`cases-status-${status}`, {
          threshold: 0.2,
          thresholdType: 'percent'
        });

        // Reset filter
        cy.get('[data-testid="clear-filters"]').click();
        cy.wait(500);
      });
    });

    it('should maintain appearance of form validation states', () => {
      cy.visit('/cases');
      cy.get('[data-testid="create-case-button"]').click();

      // Show validation errors
      cy.get('[data-testid="submit-button"]').click();
      cy.wait(500);

      cy.get('[data-testid="case-form"]').compareSnapshot('case-form-validation-errors', {
        threshold: 0.1,
        thresholdType: 'percent'
      });

      // Show success state
      cy.get('[data-testid="title-input"]').type('Valid Case Title');
      cy.get('[data-testid="patient-id-input"]').type('PT-VALID-001');
      cy.get('[data-testid="procedure-code-input"]').type('99213');
      cy.wait(500);

      cy.get('[data-testid="case-form"]').compareSnapshot('case-form-valid-state', {
        threshold: 0.1,
        thresholdType: 'percent'
      });
    });

    it('should maintain appearance of notification states', () => {
      cy.visit('/cases');
      
      // Trigger success notification
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="title-input"]').type('Test Case');
      cy.get('[data-testid="patient-id-input"]').type('PT-TEST-001');
      cy.get('[data-testid="submit-button"]').click();

      cy.get('[data-testid="notification-success"]').should('be.visible');
      cy.wait(500);

      cy.get('[data-testid="notification-success"]').compareSnapshot('success-notification', {
        threshold: 0.1,
        thresholdType: 'percent'
      });
    });

    it('should maintain appearance of loading states', () => {
      cy.visit('/analytics');
      
      // Intercept API to delay response and capture loading state
      cy.intercept('GET', '**/api/analytics/dashboard', (req) => {
        req.reply((res) => {
          setTimeout(() => {
            res.send({ fixture: 'analytics/dashboard.json' });
          }, 2000);
        });
      }).as('slowDashboard');

      cy.reload();
      
      // Capture loading state
      cy.get('[data-testid="dashboard-loading"]').should('be.visible');
      cy.get('[data-testid="analytics-dashboard"]').compareSnapshot('analytics-loading-state', {
        threshold: 0.1,
        thresholdType: 'percent'
      });
    });
  });

  describe('Responsive Visual Tests', () => {
    it('should maintain appearance on tablet viewport', () => {
      cy.viewport('ipad-2');
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.wait(1000);
      cy.compareSnapshot('dashboard-tablet', {
        threshold: 0.3,
        thresholdType: 'percent'
      });
    });

    it('should maintain appearance on mobile viewport', () => {
      cy.viewport('iphone-x');
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.wait(1000);
      cy.compareSnapshot('dashboard-mobile', {
        threshold: 0.3,
        thresholdType: 'percent'
      });
    });

    it('should maintain cases list on mobile', () => {
      cy.viewport('iphone-x');
      cy.visit('/cases');
      waitForPageLoad();

      cy.wait(1000);
      cy.compareSnapshot('cases-mobile', {
        threshold: 0.3,
        thresholdType: 'percent'
      });
    });

    it('should maintain navigation on mobile', () => {
      cy.viewport('iphone-x');
      cy.visit('/dashboard');
      waitForPageLoad();

      // Open mobile menu
      cy.get('[data-testid="mobile-menu-button"]').click();
      cy.get('[data-testid="mobile-navigation"]').should('be.visible');
      cy.wait(500);

      cy.get('[data-testid="mobile-navigation"]').compareSnapshot('mobile-navigation', {
        threshold: 0.2,
        thresholdType: 'percent'
      });
    });
  });

  describe('Theme and Dark Mode Visual Tests', () => {
    it('should maintain appearance in dark mode', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Switch to dark mode
      cy.get('[data-testid="theme-toggle"]').click();
      cy.get('[data-theme="dark"]').should('exist');
      cy.wait(1000);

      cy.compareSnapshot('dashboard-dark-mode', {
        threshold: 0.4,
        thresholdType: 'percent'
      });
    });

    it('should maintain cases list in dark mode', () => {
      cy.visit('/cases');
      waitForPageLoad();

      cy.get('[data-testid="theme-toggle"]').click();
      cy.wait(1000);

      cy.compareSnapshot('cases-dark-mode', {
        threshold: 0.4,
        thresholdType: 'percent'
      });
    });

    it('should maintain high contrast mode appearance', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Enable high contrast mode
      cy.get('[data-testid="accessibility-menu"]').click();
      cy.get('[data-testid="high-contrast-toggle"]').click();
      cy.wait(1000);

      cy.compareSnapshot('dashboard-high-contrast', {
        threshold: 0.4,
        thresholdType: 'percent'
      });
    });
  });

  describe('Print Styles Visual Tests', () => {
    it('should maintain appearance in print preview', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();
      waitForPageLoad();

      // Switch to print media query
      cy.window().then((win) => {
        const style = win.document.createElement('style');
        style.innerHTML = '@media screen { body { -webkit-print-color-adjust: exact; } }';
        win.document.head.appendChild(style);
      });

      // Simulate print styles
      cy.get('body').invoke('attr', 'data-print', 'true');
      cy.wait(1000);

      cy.compareSnapshot('case-details-print', {
        threshold: 0.3,
        thresholdType: 'percent'
      });
    });
  });

  describe('Cross-Browser Visual Consistency', () => {
    it('should maintain consistent appearance across browsers', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.wait(1000);
      
      // Take screenshot with browser information
      const browserName = Cypress.browser.name;
      cy.compareSnapshot(`dashboard-${browserName}`, {
        threshold: 0.2,
        thresholdType: 'percent'
      });
    });

    it('should maintain consistent form rendering across browsers', () => {
      cy.visit('/cases');
      cy.get('[data-testid="create-case-button"]').click();
      cy.wait(500);

      const browserName = Cypress.browser.name;
      cy.get('[data-testid="case-form"]').compareSnapshot(`case-form-${browserName}`, {
        threshold: 0.15,
        thresholdType: 'percent'
      });
    });
  });

  describe('Animation and Transition Visual Tests', () => {
    it('should capture modal animation states', () => {
      cy.visit('/cases');

      // Capture modal opening animation
      cy.get('[data-testid="create-case-button"]').click();
      
      // Capture mid-animation state
      cy.wait(150);
      cy.get('[data-testid="create-case-modal"]').compareSnapshot('modal-opening', {
        threshold: 0.2,
        thresholdType: 'percent'
      });

      // Capture final state
      cy.wait(350);
      cy.get('[data-testid="create-case-modal"]').compareSnapshot('modal-open', {
        threshold: 0.1,
        thresholdType: 'percent'
      });
    });

    it('should capture loading animation states', () => {
      cy.visit('/analytics');

      // Capture spinner animation
      cy.get('[data-testid="loading-spinner"]').should('be.visible');
      cy.get('[data-testid="loading-spinner"]').compareSnapshot('loading-spinner', {
        threshold: 0.3,
        thresholdType: 'percent'
      });
    });
  });

  describe('Error State Visual Tests', () => {
    it('should maintain appearance of error pages', () => {
      // Visit non-existent page to trigger 404
      cy.visit('/non-existent-page', { failOnStatusCode: false });
      cy.wait(1000);

      cy.compareSnapshot('404-error-page', {
        threshold: 0.2,
        thresholdType: 'percent'
      });
    });

    it('should maintain appearance of API error states', () => {
      // Intercept API to return error
      cy.intercept('GET', '**/api/cases', { statusCode: 500 }).as('apiError');

      cy.visit('/cases');
      cy.wait('@apiError');
      
      cy.get('[data-testid="error-message"]').should('be.visible');
      cy.wait(500);

      cy.compareSnapshot('api-error-state', {
        threshold: 0.2,
        thresholdType: 'percent'
      });
    });
  });
});