import { waitForPageLoad, selectFromDropdown } from '../support/commands';

describe('Cross-Browser Compatibility Tests', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Core Functionality Across Browsers', () => {
    it('should render dashboard correctly across all browsers', () => {
      cy.visit('/dashboard');
      waitForPageLoad();

      // Check critical dashboard elements
      cy.get('[data-testid="dashboard-header"]').should('be.visible');
      cy.get('[data-testid="stats-grid"]').should('be.visible');
      cy.get('[data-testid="recent-activity"]').should('be.visible');
      cy.get('[data-testid="quick-actions"]').should('be.visible');

      // Verify layout consistency
      cy.get('[data-testid="stats-grid"]').should('have.css', 'display', 'grid');
      cy.get('[data-testid="stats-card"]').should('have.length', 4);

      // Check responsive behavior
      cy.viewport('iphone-x');
      cy.get('[data-testid="mobile-menu-toggle"]').should('be.visible');
      cy.get('[data-testid="sidebar"]').should('not.be.visible');

      cy.viewport('macbook-15');
      cy.get('[data-testid="sidebar"]').should('be.visible');
      cy.get('[data-testid="mobile-menu-toggle"]').should('not.be.visible');
    });

    it('should handle form interactions consistently', () => {
      cy.visit('/cases');
      cy.get('[data-testid="create-case-button"]').click();

      // Test form inputs across browsers
      cy.get('[data-testid="title-input"]').type('Cross-browser test case');
      cy.get('[data-testid="title-input"]').should('have.value', 'Cross-browser test case');

      // Test dropdown functionality
      selectFromDropdown('priority-select', 'high');
      cy.get('[data-testid="priority-select"]').should('contain', 'High');

      // Test date picker
      cy.get('[data-testid="due-date-input"]').click();
      cy.get('[data-testid="date-picker"]').should('be.visible');
      cy.get('[data-testid="date-today"]').click();
      cy.get('[data-testid="due-date-input"]').should('not.be.empty');

      // Test checkbox and radio buttons
      cy.get('[data-testid="urgent-checkbox"]').check();
      cy.get('[data-testid="urgent-checkbox"]').should('be.checked');

      cy.get('[data-testid="case-type-medical"]').check();
      cy.get('[data-testid="case-type-medical"]').should('be.checked');
    });

    it('should maintain consistent styling and layout', () => {
      cy.visit('/cases');

      // Check CSS Grid and Flexbox support
      cy.get('[data-testid="cases-grid"]').should('have.css', 'display', 'grid');
      cy.get('[data-testid="case-filters"]').should('have.css', 'display', 'flex');

      // Verify CSS custom properties work
      cy.get('[data-testid="primary-button"]').should('have.css', 'background-color').and('match', /rgb\(\d+, \d+, \d+\)/);

      // Check text rendering
      cy.get('[data-testid="case-title"]').should('have.css', 'font-weight', '600');
      cy.get('[data-testid="case-description"]').should('have.css', 'line-height').and('not.eq', 'normal');

      // Verify shadows and borders render
      cy.get('[data-testid="case-card"]').should('have.css', 'box-shadow').and('not.eq', 'none');
      cy.get('[data-testid="case-card"]').should('have.css', 'border-radius').and('not.eq', '0px');
    });
  });

  describe('JavaScript API Compatibility', () => {
    it('should handle modern JavaScript features', () => {
      cy.visit('/dashboard');

      // Test localStorage
      cy.window().then((win) => {
        win.localStorage.setItem('test-key', 'test-value');
        expect(win.localStorage.getItem('test-key')).to.equal('test-value');
      });

      // Test fetch API
      cy.window().its('fetch').should('be.a', 'function');

      // Test Promise support
      cy.window().then((win) => {
        return new win.Promise((resolve) => {
          setTimeout(() => resolve('test'), 100);
        });
      }).should('equal', 'test');

      // Test async/await compatibility (implicit in Cypress commands)
      cy.get('[data-testid="refresh-button"]').click();
      cy.wait('@getDashboardData');
      cy.get('[data-testid="last-updated"]').should('contain', 'just now');
    });

    it('should handle WebSocket connections', () => {
      cy.visit('/dashboard');

      // Test WebSocket connection
      cy.window().then((win) => {
        // WebSocket should be available
        expect(win.WebSocket).to.be.a('function');
      });

      // Verify real-time updates work
      cy.get('[data-testid="connection-status"]').should('contain', 'Connected');

      // Simulate network change
      cy.window().then((win) => {
        const event = new win.Event('offline');
        win.dispatchEvent(event);
      });

      cy.get('[data-testid="connection-status"]').should('contain', 'Offline');

      cy.window().then((win) => {
        const event = new win.Event('online');
        win.dispatchEvent(event);
      });

      cy.get('[data-testid="connection-status"]').should('contain', 'Connected');
    });

    it('should support File API for uploads', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="documents-tab"]').click();

      // Test file input
      cy.get('[data-testid="file-input"]').should('exist');

      // Test drag and drop support
      cy.get('[data-testid="drop-zone"]').should('be.visible');
      cy.get('[data-testid="drop-zone"]').should('have.attr', 'data-accepts-drops', 'true');

      // Simulate file upload
      cy.fixture('test-document.pdf', 'base64').then(fileContent => {
        cy.get('[data-testid="file-input"]').attachFile({
          fileContent,
          fileName: 'test-document.pdf',
          mimeType: 'application/pdf',
          encoding: 'base64',
        });
      });

      cy.get('[data-testid="upload-progress"]').should('be.visible');
      cy.wait('@uploadFile');
      cy.get('[data-testid="upload-success"]').should('be.visible');
    });
  });

  describe('Performance Across Browsers', () => {
    it('should load pages within acceptable time limits', () => {
      const startTime = Date.now();
      
      cy.visit('/dashboard');
      waitForPageLoad();
      
      cy.then(() => {
        const loadTime = Date.now() - startTime;
        expect(loadTime).to.be.lessThan(3000); // 3 seconds max
      });

      // Test navigation performance
      const navStartTime = Date.now();
      cy.get('[data-testid="sidebar-cases"]').click();
      cy.url().should('include', '/cases');
      
      cy.then(() => {
        const navTime = Date.now() - navStartTime;
        expect(navTime).to.be.lessThan(1000); // 1 second max for navigation
      });
    });

    it('should handle large datasets efficiently', () => {
      // Create large dataset
      cy.task('seedLargeDataset', { caseCount: 1000 });
      
      cy.visit('/cases');
      
      // Test pagination performance
      cy.get('[data-testid="cases-table"]').should('be.visible');
      cy.get('[data-testid="pagination-info"]').should('contain', '1000 total');
      
      // Test search performance
      const searchStartTime = Date.now();
      cy.get('[data-testid="search-input"]').type('cardiac');
      cy.get('[data-testid="search-button"]').click();
      cy.wait('@searchCases');
      
      cy.then(() => {
        const searchTime = Date.now() - searchStartTime;
        expect(searchTime).to.be.lessThan(2000); // 2 seconds max for search
      });
      
      // Test filter performance
      selectFromDropdown('status-filter', 'pending');
      cy.wait('@getCases');
      cy.get('[data-testid="filter-results"]').should('be.visible');
    });

    it('should maintain smooth animations', () => {
      cy.visit('/dashboard');
      
      // Test modal animations
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="modal-backdrop"]').should('have.css', 'animation-duration');
      cy.get('[data-testid="modal-content"]').should('have.css', 'transform').and('not.eq', 'none');
      
      cy.get('[data-testid="modal-close"]').click();
      cy.get('[data-testid="modal-backdrop"]').should('not.exist');
      
      // Test loading animations
      cy.get('[data-testid="refresh-button"]').click();
      cy.get('[data-testid="loading-spinner"]').should('be.visible');
      cy.get('[data-testid="loading-spinner"]').should('have.css', 'animation-name').and('not.eq', 'none');
    });
  });

  describe('Accessibility Across Browsers', () => {
    it('should maintain accessibility standards', () => {
      cy.visit('/dashboard');
      
      // Test focus management
      cy.tab();
      cy.focused().should('be.visible');
      
      // Test keyboard navigation
      cy.get('[data-testid="skip-to-main"]').focus().type('{enter}');
      cy.focused().should('have.attr', 'data-testid', 'main-content');
      
      // Test ARIA attributes
      cy.get('[data-testid="sidebar"]').should('have.attr', 'aria-label');
      cy.get('[data-testid="stats-grid"]').should('have.attr', 'role', 'region');
      
      // Test screen reader announcements
      cy.get('[data-testid="notification-region"]').should('have.attr', 'aria-live', 'polite');
    });

    it('should handle high contrast mode', () => {
      // Simulate high contrast mode
      cy.window().then((win) => {
        const mediaQuery = win.matchMedia('(prefers-contrast: high)');
        if (mediaQuery.matches) {
          cy.get('[data-testid="high-contrast-styles"]').should('exist');
        }
      });

      // Test forced colors mode
      cy.get('[data-testid="primary-button"]').should('have.css', 'border').and('not.eq', 'none');
      cy.get('[data-testid="case-card"]').should(($el) => {
        const hasOutline = $el.css('outline') !== 'none';
        const hasBorder = $el.css('border') !== 'none';
        expect(hasOutline || hasBorder).to.be.true;
      });
    });

    it('should support reduced motion preferences', () => {
      cy.window().then((win) => {
        // Test prefers-reduced-motion
        const mediaQuery = win.matchMedia('(prefers-reduced-motion: reduce)');
        if (mediaQuery.matches) {
          cy.get('[data-testid="animated-element"]').should('have.css', 'animation', 'none');
          cy.get('[data-testid="transition-element"]').should('have.css', 'transition', 'none');
        }
      });
    });
  });

  describe('Browser-Specific Edge Cases', () => {
    it('should handle Safari-specific issues', () => {
      // Test Safari date input handling
      cy.get('[data-testid="date-input"]').then(($input) => {
        if (Cypress.browser.name === 'webkit') {
          // Safari-specific date format handling
          cy.wrap($input).type('12/31/2024');
          cy.wrap($input).should('have.value', '2024-12-31');
        }
      });
      
      // Test Safari flexbox gap support
      cy.get('[data-testid="flex-container"]').should(($el) => {
        const hasGap = $el.css('gap') !== 'normal';
        const hasMargin = $el.css('margin') !== '0px';
        expect(hasGap || hasMargin).to.be.true;
      });
    });

    it('should handle Firefox-specific behaviors', () => {
      if (Cypress.browser.name === 'firefox') {
        // Test Firefox focus ring behavior
        cy.get('[data-testid="button"]').focus();
        cy.get('[data-testid="button"]').should('have.css', 'outline').and('not.eq', 'none');
        
        // Test Firefox form validation
        cy.get('[data-testid="required-input"]').clear();
        cy.get('[data-testid="submit-button"]').click();
        cy.get('[data-testid="required-input"]:invalid').should('exist');
      }
    });

    it('should handle Chrome-specific features', () => {
      if (Cypress.browser.name === 'chrome') {
        // Test Chrome autofill behavior
        cy.get('[data-testid="email-input"]').should('have.attr', 'autocomplete', 'email');
        
        // Test Chrome performance API
        cy.window().then((win) => {
          expect(win.performance.mark).to.be.a('function');
          expect(win.performance.measure).to.be.a('function');
        });
      }
    });
  });

  describe('Mobile Browser Compatibility', () => {
    beforeEach(() => {
      cy.viewport('iphone-x');
    });

    it('should handle mobile touch interactions', () => {
      cy.visit('/dashboard');
      
      // Test mobile menu
      cy.get('[data-testid="mobile-menu-toggle"]').click();
      cy.get('[data-testid="mobile-sidebar"]').should('be.visible');
      
      // Test swipe gestures (simulated)
      cy.get('[data-testid="mobile-sidebar"]').trigger('touchstart', { clientX: 300 });
      cy.get('[data-testid="mobile-sidebar"]').trigger('touchmove', { clientX: 100 });
      cy.get('[data-testid="mobile-sidebar"]').trigger('touchend');
      cy.get('[data-testid="mobile-sidebar"]').should('not.be.visible');
      
      // Test pull-to-refresh
      cy.get('[data-testid="main-content"]').trigger('touchstart', { clientY: 100 });
      cy.get('[data-testid="main-content"]').trigger('touchmove', { clientY: 200 });
      cy.get('[data-testid="pull-refresh-indicator"]').should('be.visible');
      cy.get('[data-testid="main-content"]').trigger('touchend');
    });

    it('should maintain usability on small screens', () => {
      cy.visit('/cases');
      
      // Test responsive table
      cy.get('[data-testid="cases-table"]').should('not.be.visible');
      cy.get('[data-testid="cases-cards"]').should('be.visible');
      
      // Test mobile form interactions
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="mobile-form"]').should('be.visible');
      
      // All form fields should be easily tappable
      cy.get('[data-testid="form-field"]').each(($field) => {
        cy.wrap($field).should('have.css', 'min-height').and('match', /\d+px/);
        const minHeight = parseInt($field.css('min-height'));
        expect(minHeight).to.be.at.least(44); // iOS HIG recommendation
      });
    });
  });
});