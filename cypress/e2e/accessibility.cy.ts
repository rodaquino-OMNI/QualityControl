import { waitForPageLoad, selectFromDropdown, checkNotification } from '../support/commands';

describe('Accessibility Testing with axe-core', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
    cy.injectAxe();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Page-Level Accessibility', () => {
    it('should meet WCAG 2.1 AA standards on login page', () => {
      cy.logout();
      cy.visit('/login');
      waitForPageLoad();

      cy.checkA11y(null, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa']
        }
      });
    });

    it('should meet accessibility standards on dashboard', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.checkA11y('[data-testid="dashboard-container"]', {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa']
        },
        rules: {
          'color-contrast': { enabled: true },
          'focus-order-semantics': { enabled: true },
          'keyboard-navigation': { enabled: true }
        }
      });
    });

    it('should meet accessibility standards on cases list page', () => {
      cy.visit('/cases');
      waitForPageLoad();

      cy.checkA11y('[data-testid="cases-page"]', {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa']
        }
      });
    });

    it('should meet accessibility standards on case details page', () => {
      cy.visit('/cases');
      waitForPageLoad();
      
      cy.get('[data-testid="case-row"]').first().click();
      waitForPageLoad();

      cy.checkA11y('[data-testid="case-details"]', {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa']
        }
      });
    });

    it('should meet accessibility standards on analytics dashboard', () => {
      cy.visit('/analytics');
      waitForPageLoad();

      cy.checkA11y('[data-testid="analytics-dashboard"]', {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21aa']
        },
        rules: {
          'color-contrast': { enabled: true },
          'aria-valid-attr-value': { enabled: true }
        }
      });
    });
  });

  describe('Component-Level Accessibility', () => {
    it('should have accessible navigation menu', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Check main navigation
      cy.get('[data-testid="main-navigation"]').within(() => {
        cy.checkA11y(null, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa']
          }
        });
      });

      // Verify navigation is keyboard accessible
      cy.get('[data-testid="nav-dashboard"]').focus().should('be.focused');
      cy.focused().type('{downArrow}');
      cy.get('[data-testid="nav-cases"]').should('be.focused');
    });

    it('should have accessible forms with proper labels', () => {
      cy.visit('/cases');
      cy.get('[data-testid="create-case-button"]').click();

      cy.get('[data-testid="create-case-modal"]').within(() => {
        // Check form accessibility
        cy.checkA11y(null, {
          rules: {
            'label': { enabled: true },
            'label-title-only': { enabled: true },
            'form-field-multiple-labels': { enabled: true }
          }
        });

        // Verify all form inputs have labels
        cy.get('input, select, textarea').each(($el) => {
          const id = $el.attr('id');
          if (id) {
            cy.get(`label[for="${id}"]`).should('exist');
          }
        });
      });
    });

    it('should have accessible data tables', () => {
      cy.visit('/cases');
      waitForPageLoad();

      cy.get('[data-testid="cases-table"]').within(() => {
        cy.checkA11y(null, {
          rules: {
            'table-fake-caption': { enabled: true },
            'td-headers-attr': { enabled: true },
            'th-has-data-cells': { enabled: true }
          }
        });

        // Verify table headers
        cy.get('th').should('have.attr', 'scope');
        
        // Verify table has caption or aria-label
        cy.get('table').should('satisfy', ($table) => {
          return $table.attr('aria-label') || $table.find('caption').length > 0;
        });
      });
    });

    it('should have accessible modal dialogs', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="delete-case-button"]').click();

      cy.get('[data-testid="delete-confirmation-modal"]').within(() => {
        cy.checkA11y(null, {
          rules: {
            'aria-dialog-name': { enabled: true },
            'focus-order-semantics': { enabled: true }
          }
        });

        // Verify modal traps focus
        cy.get('[data-testid="confirm-delete"]').focus();
        cy.focused().tab({ shift: true });
        cy.get('[data-testid="cancel-delete"]').should('be.focused');
      });

      // Verify modal can be closed with Escape key
      cy.get('body').type('{esc}');
      cy.get('[data-testid="delete-confirmation-modal"]').should('not.exist');
    });

    it('should have accessible charts and data visualizations', () => {
      cy.visit('/analytics');
      waitForPageLoad();

      cy.get('[data-testid="case-volume-chart"]').within(() => {
        cy.checkA11y(null, {
          rules: {
            'aria-valid-attr-value': { enabled: true },
            'aria-required-attr': { enabled: true }
          }
        });

        // Verify chart has appropriate ARIA attributes
        cy.get('[role="img"]').should('have.attr', 'aria-label');
        
        // Check for alternative text representation
        cy.get('[data-testid="chart-data-table"]').should('exist');
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should support full keyboard navigation on main pages', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Start navigation from skip link
      cy.get('body').tab();
      cy.focused().should('contain.text', 'Skip to main content');

      // Navigate through main sections
      cy.focused().tab();
      cy.focused().should('have.attr', 'data-testid', 'main-navigation');

      // Continue through interactive elements
      cy.focused().tab();
      cy.focused().should('be.visible');
    });

    it('should support keyboard navigation in case management', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Navigate to case actions
      cy.get('[data-testid="case-row"]').first().focus();
      cy.focused().type('{enter}');

      // Should open case details
      cy.url().should('match', /\/cases\/\d+/);

      // Navigate through case details with keyboard
      cy.get('[data-testid="case-tabs"]').focus();
      cy.focused().type('{rightArrow}');
      cy.get('[data-testid="ai-analysis-tab"]').should('be.focused');
    });

    it('should support keyboard navigation in forms', () => {
      cy.visit('/cases');
      cy.get('[data-testid="create-case-button"]').focus().type('{enter}');

      cy.get('[data-testid="create-case-modal"]').within(() => {
        // Tab through form fields
        cy.get('[data-testid="title-input"]').focus();
        cy.focused().tab();
        cy.get('[data-testid="description-input"]').should('be.focused');

        cy.focused().tab();
        cy.get('[data-testid="priority-select"]').should('be.focused');

        // Test select dropdown keyboard navigation
        cy.focused().type('{downArrow}');
        cy.focused().type('{enter}');
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should provide proper ARIA landmarks', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Verify main landmarks exist
      cy.get('[role="banner"]').should('exist'); // Header
      cy.get('[role="main"]').should('exist'); // Main content
      cy.get('[role="navigation"]').should('exist'); // Navigation
      cy.get('[role="contentinfo"]').should('exist'); // Footer

      // Verify landmark labels
      cy.get('[role="navigation"]').should('have.attr', 'aria-label');
      cy.get('[role="main"]').should('have.attr', 'aria-label');
    });

    it('should provide proper heading hierarchy', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Check heading levels are logical
      cy.get('h1').should('have.length', 1);
      cy.get('h1').should('contain', 'Cases');

      // Verify no heading levels are skipped
      cy.get('h1, h2, h3, h4, h5, h6').then(($headings) => {
        const levels = Array.from($headings).map(h => parseInt(h.tagName.slice(1)));
        levels.forEach((level, index) => {
          if (index > 0) {
            expect(level - levels[index - 1]).to.be.at.most(1);
          }
        });
      });
    });

    it('should provide descriptive link text', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Check all links have meaningful text
      cy.get('a').each(($link) => {
        const text = $link.text().trim();
        const ariaLabel = $link.attr('aria-label');
        const title = $link.attr('title');

        // Link should have meaningful text, aria-label, or title
        expect(text || ariaLabel || title).to.not.be.empty;
        expect(text || ariaLabel || title).to.not.match(/^(click|link|here|read more)$/i);
      });
    });

    it('should provide status announcements for dynamic content', () => {
      cy.visit('/cases');
      
      // Create a case to trigger status update
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="title-input"]').type('Test Case');
      cy.get('[data-testid="patient-id-input"]').type('PT-TEST-001');
      cy.get('[data-testid="submit-button"]').click();

      // Verify live region announces the status
      cy.get('[role="status"], [aria-live]').should('contain.text', 'Case created successfully');
    });
  });

  describe('Color and Contrast', () => {
    it('should meet color contrast requirements', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Run color contrast checks
      cy.checkA11y(null, {
        rules: {
          'color-contrast': { enabled: true },
          'color-contrast-enhanced': { enabled: true }
        }
      });
    });

    it('should not rely solely on color for information', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Check status indicators have more than just color
      cy.get('[data-testid="case-status"]').each(($status) => {
        // Should have text or icon in addition to color
        const hasText = $status.text().trim().length > 0;
        const hasIcon = $status.find('[data-testid*="icon"]').length > 0;
        const hasPattern = $status.css('background-image') !== 'none';
        
        expect(hasText || hasIcon || hasPattern).to.be.true;
      });
    });
  });

  describe('Error Handling and Feedback', () => {
    it('should provide accessible error messages', () => {
      cy.visit('/login');
      
      // Trigger validation errors
      cy.get('[data-testid="login-button"]').click();

      // Check error messages are properly associated
      cy.get('[data-testid="email-error"]').should('have.attr', 'id');
      cy.get('[data-testid="email-input"]').should('have.attr', 'aria-describedby');

      // Verify error message relationship
      cy.get('[data-testid="email-input"]').then(($input) => {
        const describedBy = $input.attr('aria-describedby');
        cy.get(`#${describedBy}`).should('contain', 'Email is required');
      });
    });

    it('should provide accessible loading states', () => {
      cy.visit('/cases');
      cy.get('[data-testid="refresh-cases-button"]').click();

      // Check loading indicator is announced
      cy.get('[data-testid="loading-indicator"]').should('have.attr', 'aria-label', 'Loading cases');
      cy.get('[aria-live="polite"]').should('contain', 'Loading');
    });
  });

  describe('Mobile and Responsive Accessibility', () => {
    it('should maintain accessibility on mobile viewport', () => {
      cy.viewport('iphone-x');
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.checkA11y(null, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa']
        }
      });

      // Verify touch targets are adequate size
      cy.get('button, a, input[type="checkbox"], input[type="radio"]').each(($el) => {
        const rect = $el[0].getBoundingClientRect();
        expect(Math.min(rect.width, rect.height)).to.be.at.least(44);
      });
    });

    it('should support zoom up to 200% without horizontal scrolling', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Simulate 200% zoom
      cy.viewport(640, 360); // Half the standard viewport
      
      // Check no horizontal scroll appears
      cy.window().its('document.body.scrollWidth').should('be.lte', 640);
      
      // Verify content is still accessible
      cy.get('[data-testid="cases-table"]').should('be.visible');
      cy.get('[data-testid="create-case-button"]').should('be.visible');
    });
  });

  describe('Accessibility Testing with Different Assistive Technologies', () => {
    it('should work with keyboard-only navigation', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Disable mouse events to simulate keyboard-only
      cy.window().then((win) => {
        win.document.addEventListener('mousedown', (e) => e.preventDefault());
        win.document.addEventListener('click', (e) => e.preventDefault());
      });

      // Navigate and interact using only keyboard
      cy.get('body').tab();
      cy.focused().tab(); // Skip to main navigation
      cy.focused().tab(); // Move to cases section
      
      // Should be able to reach and activate all interactive elements
      cy.get('[data-testid="create-case-button"]').focus().type('{enter}');
      cy.get('[data-testid="create-case-modal"]').should('be.visible');
    });

    it('should provide adequate focus indicators', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Check all focusable elements have visible focus indicators
      cy.get('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])').each(($el) => {
        cy.wrap($el).focus();
        
        // Focus indicator should be visible (outline or box-shadow)
        cy.wrap($el).should('satisfy', ($focused) => {
          const styles = window.getComputedStyle($focused[0]);
          const hasOutline = styles.outline !== 'none' && styles.outline !== '0px';
          const hasBoxShadow = styles.boxShadow !== 'none';
          const hasCustomFocus = $focused.hasClass('focus-visible') || $focused.hasClass('focused');
          
          return hasOutline || hasBoxShadow || hasCustomFocus;
        });
      });
    });
  });

  describe('Accessibility Regression Testing', () => {
    it('should maintain accessibility after dynamic content updates', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Initial accessibility check
      cy.checkA11y();

      // Add new case (dynamic content update)
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="title-input"]').type('Accessibility Test Case');
      cy.get('[data-testid="patient-id-input"]').type('PT-A11Y-001');
      cy.get('[data-testid="submit-button"]').click();

      // Wait for content update
      cy.get('[data-testid="notification-success"]').should('be.visible');
      
      // Verify accessibility is maintained after update
      cy.checkA11y();
    });

    it('should maintain accessibility during state changes', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      // Initial state check
      cy.checkA11y();

      // Change case status (state change)
      cy.get('[data-testid="status-dropdown"]').click();
      cy.get('[data-testid="status-in_progress"]').click();

      // Verify accessibility after state change
      cy.checkA11y();
    });
  });
});