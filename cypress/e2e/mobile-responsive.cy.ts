import { waitForPageLoad, selectFromDropdown, checkNotification, fillForm } from '../support/commands';

describe('Mobile Responsive User Journey', () => {
  const viewports = [
    { name: 'iPhone 12', width: 390, height: 844 },
    { name: 'Samsung Galaxy S21', width: 360, height: 800 },
    { name: 'iPad', width: 768, height: 1024 },
    { name: 'iPad Pro', width: 1024, height: 1366 }
  ];

  viewports.forEach(viewport => {
    describe(`${viewport.name} (${viewport.width}x${viewport.height})`, () => {
      beforeEach(() => {
        cy.viewport(viewport.width, viewport.height);
        cy.seedDatabase();
      });

      afterEach(() => {
        cy.cleanupDatabase();
      });

      describe('Mobile Navigation', () => {
        it('should display mobile-optimized navigation menu', () => {
          cy.visit('/');
          
          // Mobile menu should be visible instead of desktop nav
          cy.get('[data-testid="mobile-menu-toggle"]').should('be.visible');
          cy.get('[data-testid="desktop-nav"]').should('not.be.visible');
          
          // Open mobile menu
          cy.get('[data-testid="mobile-menu-toggle"]').click();
          cy.get('[data-testid="mobile-menu-drawer"]').should('be.visible');
          
          // Verify menu items are touch-friendly
          cy.get('[data-testid="mobile-menu-item"]').each(($el) => {
            cy.wrap($el).should('have.css', 'min-height').and('match', /^(44|48|[5-9]\d|\d{3,})px$/);
          });
          
          // Close menu by tapping outside
          cy.get('[data-testid="mobile-menu-overlay"]').click({ force: true });
          cy.get('[data-testid="mobile-menu-drawer"]').should('not.be.visible');
        });

        it('should navigate using bottom tab bar on small screens', () => {
          if (viewport.width < 768) {
            cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
            cy.visit('/dashboard');
            
            // Bottom tab bar should be visible on mobile
            cy.get('[data-testid="bottom-tab-bar"]').should('be.visible');
            
            // Navigate to cases
            cy.get('[data-testid="tab-cases"]').click();
            cy.url().should('include', '/cases');
            cy.get('[data-testid="tab-cases"]').should('have.class', 'active');
            
            // Navigate to analytics
            cy.get('[data-testid="tab-analytics"]').click();
            cy.url().should('include', '/analytics');
            cy.get('[data-testid="tab-analytics"]').should('have.class', 'active');
          }
        });
      });

      describe('Mobile Authentication Flow', () => {
        it('should login successfully on mobile', () => {
          cy.visit('/login');
          
          // Form should be mobile-optimized
          cy.get('[data-testid="login-form"]').should('be.visible');
          cy.get('[data-testid="login-form"]').should('have.css', 'width').and('match', /^(\d{3}|[3-9]\d{2})px$/);
          
          // Input fields should be touch-friendly
          cy.get('#email').should('have.css', 'font-size').and('match', /^(16|[1-9][6-9]|[2-9]\d)px$/);
          cy.get('#password').should('have.css', 'font-size').and('match', /^(16|[1-9][6-9]|[2-9]\d)px$/);
          
          // Login
          cy.get('#email').type(Cypress.env('testUsers').auditor.email);
          cy.get('#password').type(Cypress.env('testUsers').auditor.password);
          cy.get('button[type="submit"]').click();
          
          cy.url().should('include', '/dashboard');
        });

        it('should handle MFA on mobile with virtual keyboard considerations', () => {
          cy.visit('/login');
          cy.get('#email').type('mfa-user@example.com');
          cy.get('#password').type('Password123!');
          cy.get('button[type="submit"]').click();
          
          // MFA input should be optimized for mobile
          cy.get('#mfaToken').should('be.visible');
          cy.get('#mfaToken').should('have.attr', 'inputmode', 'numeric');
          cy.get('#mfaToken').should('have.attr', 'autocomplete', 'one-time-code');
          
          // Virtual keyboard should not obscure the input
          cy.get('#mfaToken').click();
          cy.wait(500); // Wait for virtual keyboard
          cy.get('#mfaToken').should('be.in.viewport');
        });
      });

      describe('Mobile Case Management', () => {
        beforeEach(() => {
          cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
        });

        it('should display cases in mobile-friendly card layout', () => {
          cy.visit('/cases');
          waitForPageLoad();
          
          // Cases should be in card format on mobile
          cy.get('[data-testid="case-card"]').should('be.visible');
          
          // Cards should stack vertically on small screens
          if (viewport.width < 768) {
            cy.get('[data-testid="cases-grid"]').should('have.css', 'grid-template-columns', 'repeat(1, 1fr)');
          }
          
          // Touch targets should be adequate
          cy.get('[data-testid="case-card"]').first().should('have.css', 'min-height').and('match', /^(80|[8-9]\d|\d{3,})px$/);
        });

        it('should handle swipe gestures for case actions', () => {
          if (viewport.width < 768) {
            cy.visit('/cases');
            waitForPageLoad();
            
            // Swipe to reveal actions
            cy.get('[data-testid="case-card"]').first()
              .trigger('touchstart', { touches: [{ clientX: 300, clientY: 100 }] })
              .trigger('touchmove', { touches: [{ clientX: 100, clientY: 100 }] })
              .trigger('touchend');
            
            // Action buttons should be visible
            cy.get('[data-testid="swipe-action-approve"]').should('be.visible');
            cy.get('[data-testid="swipe-action-deny"]').should('be.visible');
            
            // Tap to approve
            cy.get('[data-testid="swipe-action-approve"]').click();
            checkNotification('Case approved', 'success');
          }
        });

        it('should use mobile-optimized filters', () => {
          cy.visit('/cases');
          
          // Filter button should open bottom sheet on mobile
          cy.get('[data-testid="mobile-filter-button"]').click();
          cy.get('[data-testid="filter-bottom-sheet"]').should('be.visible');
          
          // Apply filters
          cy.get('[data-testid="filter-status-pending"]').click();
          cy.get('[data-testid="filter-priority-high"]').click();
          cy.get('[data-testid="apply-filters-mobile"]').click();
          
          cy.wait('@getCases');
          cy.get('[data-testid="filter-bottom-sheet"]').should('not.be.visible');
          cy.get('[data-testid="active-filters-badge"]').should('contain', '2');
        });
      });

      describe('Mobile File Upload/Download', () => {
        beforeEach(() => {
          cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
        });

        it('should handle file upload via camera on mobile devices', () => {
          cy.visit('/cases');
          cy.get('[data-testid="case-card"]').first().click();
          cy.get('[data-testid="documents-tab"]').click();
          
          // Camera option should be available on mobile
          cy.get('[data-testid="upload-button"]').click();
          cy.get('[data-testid="upload-options"]').should('be.visible');
          
          if (viewport.width < 768) {
            cy.get('[data-testid="camera-capture"]').should('be.visible');
            cy.get('[data-testid="photo-library"]').should('be.visible');
          }
          
          // File input should accept camera capture
          cy.get('input[type="file"]').should('have.attr', 'accept').and('include', 'image/*');
          cy.get('input[type="file"]').should('have.attr', 'capture', 'environment');
        });

        it('should optimize download experience for mobile', () => {
          cy.visit('/cases');
          cy.get('[data-testid="case-card"]').first().click();
          cy.get('[data-testid="documents-tab"]').click();
          
          // Download should show mobile-friendly progress
          cy.get('[data-testid="document-item"]').first().within(() => {
            cy.get('[data-testid="download-button"]').click();
          });
          
          cy.get('[data-testid="download-progress-toast"]').should('be.visible');
          cy.get('[data-testid="download-progress-bar"]').should('be.visible');
          
          // Should offer to open in appropriate app
          cy.get('[data-testid="open-in-app-prompt"]').should('be.visible');
        });
      });

      describe('Mobile Touch Interactions', () => {
        beforeEach(() => {
          cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
        });

        it('should support pull-to-refresh', () => {
          cy.visit('/dashboard');
          waitForPageLoad();
          
          // Pull to refresh
          cy.get('[data-testid="dashboard-container"]')
            .trigger('touchstart', { touches: [{ clientX: 200, clientY: 100 }] })
            .trigger('touchmove', { touches: [{ clientX: 200, clientY: 300 }] })
            .trigger('touchend');
          
          cy.get('[data-testid="refresh-indicator"]').should('be.visible');
          cy.wait('@refreshDashboard');
          checkNotification('Dashboard refreshed', 'info');
        });

        it('should handle long press for context menus', () => {
          cy.visit('/cases');
          waitForPageLoad();
          
          // Long press on case
          cy.get('[data-testid="case-card"]').first()
            .trigger('touchstart', { touches: [{ clientX: 200, clientY: 200 }] })
            .wait(500)
            .trigger('touchend');
          
          // Context menu should appear
          cy.get('[data-testid="context-menu"]').should('be.visible');
          cy.get('[data-testid="context-menu-approve"]').should('be.visible');
          cy.get('[data-testid="context-menu-deny"]').should('be.visible');
          cy.get('[data-testid="context-menu-assign"]').should('be.visible');
        });

        it('should support pinch-to-zoom on charts', () => {
          cy.visit('/analytics');
          waitForPageLoad();
          
          // Pinch to zoom on chart
          cy.get('[data-testid="case-volume-chart"]')
            .trigger('touchstart', {
              touches: [
                { clientX: 150, clientY: 200 },
                { clientX: 250, clientY: 200 }
              ]
            })
            .trigger('touchmove', {
              touches: [
                { clientX: 100, clientY: 200 },
                { clientX: 300, clientY: 200 }
              ]
            })
            .trigger('touchend');
          
          cy.get('[data-testid="chart-zoom-level"]').should('not.contain', '100%');
          cy.get('[data-testid="reset-zoom-button"]').should('be.visible');
        });
      });

      describe('Mobile Forms and Input', () => {
        beforeEach(() => {
          cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
        });

        it('should optimize form layouts for mobile', () => {
          cy.visit('/cases');
          cy.get('[data-testid="create-case-button"]').click();
          
          // Form should be single column on mobile
          if (viewport.width < 768) {
            cy.get('[data-testid="create-case-form"]').within(() => {
              cy.get('.form-row').should('have.css', 'flex-direction', 'column');
            });
          }
          
          // Labels should be above inputs
          cy.get('label').first().then($label => {
            const labelRect = $label[0].getBoundingClientRect();
            cy.get('input').first().then($input => {
              const inputRect = $input[0].getBoundingClientRect();
              expect(labelRect.bottom).to.be.lessThan(inputRect.top);
            });
          });
        });

        it('should use appropriate input types for mobile keyboards', () => {
          cy.visit('/cases');
          cy.get('[data-testid="create-case-button"]').click();
          
          // Check input types
          cy.get('[data-testid="patient-id-input"]').should('have.attr', 'inputmode', 'text');
          cy.get('[data-testid="claim-amount-input"]').should('have.attr', 'inputmode', 'decimal');
          cy.get('[data-testid="service-date-input"]').should('have.attr', 'type', 'date');
          
          // Phone input should trigger tel keyboard
          cy.get('[data-testid="provider-phone-input"]').should('have.attr', 'type', 'tel');
          cy.get('[data-testid="provider-phone-input"]').should('have.attr', 'inputmode', 'tel');
        });

        it('should handle auto-complete and suggestions on mobile', () => {
          cy.visit('/cases');
          cy.get('[data-testid="search-input"]').type('card');
          
          // Suggestions should appear as mobile-friendly overlay
          cy.get('[data-testid="search-suggestions"]').should('be.visible');
          cy.get('[data-testid="suggestion-item"]').should('have.css', 'min-height').and('match', /^(44|[4-9]\d|\d{3,})px$/);
          
          // Tap suggestion
          cy.get('[data-testid="suggestion-item"]').first().click();
          cy.get('[data-testid="search-input"]').should('have.value', 'cardiac');
        });
      });

      describe('Mobile Performance', () => {
        it('should lazy load images on mobile', () => {
          cy.visit('/cases');
          waitForPageLoad();
          
          // Images should have loading="lazy" attribute
          cy.get('img').each($img => {
            cy.wrap($img).should('have.attr', 'loading', 'lazy');
          });
          
          // Scroll to load more
          cy.scrollTo('bottom');
          cy.get('[data-testid="loading-more-indicator"]').should('be.visible');
        });

        it('should use reduced motion for animations on mobile', () => {
          // Set prefers-reduced-motion
          cy.visit('/dashboard', {
            onBeforeLoad(win) {
              cy.stub(win, 'matchMedia')
                .withArgs('(prefers-reduced-motion: reduce)')
                .returns({ matches: true });
            }
          });
          
          // Animations should be disabled
          cy.get('[data-testid="animated-element"]').should('have.css', 'transition-duration', '0s');
        });
      });

      describe('Mobile Offline Support', () => {
        it('should work offline with cached data', () => {
          // Visit while online
          cy.visit('/dashboard');
          waitForPageLoad();
          
          // Go offline
          cy.window().then(win => {
            cy.wrap(win.navigator.onLine).should('be.true');
            cy.stub(win.navigator, 'onLine').value(false);
            win.dispatchEvent(new Event('offline'));
          });
          
          // Should show offline indicator
          cy.get('[data-testid="offline-indicator"]').should('be.visible');
          
          // Should still be able to view cached data
          cy.visit('/cases');
          cy.get('[data-testid="cached-data-notice"]').should('be.visible');
          cy.get('[data-testid="case-card"]').should('have.length.greaterThan', 0);
        });

        it('should queue actions while offline', () => {
          cy.visit('/cases');
          cy.get('[data-testid="case-card"]').first().click();
          
          // Go offline
          cy.window().then(win => {
            cy.stub(win.navigator, 'onLine').value(false);
            win.dispatchEvent(new Event('offline'));
          });
          
          // Add comment while offline
          cy.get('[data-testid="comment-input"]').type('Offline comment');
          cy.get('[data-testid="add-comment-button"]').click();
          
          cy.get('[data-testid="queued-action-notice"]').should('be.visible');
          cy.get('[data-testid="sync-queue-count"]').should('contain', '1');
          
          // Go back online
          cy.window().then(win => {
            cy.stub(win.navigator, 'onLine').value(true);
            win.dispatchEvent(new Event('online'));
          });
          
          // Should sync automatically
          cy.get('[data-testid="syncing-indicator"]').should('be.visible');
          cy.wait('@syncQueue');
          checkNotification('Changes synced', 'success');
        });
      });
    });
  });
});