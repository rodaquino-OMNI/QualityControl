import { waitForPageLoad, selectFromDropdown } from '../support/commands';

describe('Performance and Load Testing', () => {
  beforeEach(() => {
    cy.seedDatabase();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Page Load Performance', () => {
    it('should meet Core Web Vitals benchmarks', () => {
      cy.visit('/dashboard', {
        onBeforeLoad: (win) => {
          // Start performance monitoring
          win.performance.mark('navigation-start');
        }
      });

      // Wait for page to fully load
      waitForPageLoad();

      cy.window().then((win) => {
        // Measure First Contentful Paint (FCP)
        const fcpEntry = win.performance.getEntriesByName('first-contentful-paint')[0];
        if (fcpEntry) {
          expect(fcpEntry.startTime).to.be.lessThan(1800); // Good FCP < 1.8s
        }

        // Measure Largest Contentful Paint (LCP)
        return new Promise((resolve) => {
          new win.PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1];
            if (lastEntry) {
              expect(lastEntry.startTime).to.be.lessThan(2500); // Good LCP < 2.5s
            }
            resolve(lastEntry?.startTime);
          }).observe({ entryTypes: ['largest-contentful-paint'] });
        });
      });

      // Measure Cumulative Layout Shift (CLS)
      cy.window().then((win) => {
        return new Promise((resolve) => {
          let clsValue = 0;
          new win.PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const layoutShiftEntry = entry as any;
              if (!layoutShiftEntry.hadRecentInput) {
                clsValue += layoutShiftEntry.value || 0;
              }
            }
            expect(clsValue).to.be.lessThan(0.1); // Good CLS < 0.1
            resolve(clsValue);
          }).observe({ entryTypes: ['layout-shift'] });
        });
      });

      // Measure First Input Delay (FID) simulation
      cy.get('[data-testid="interactive-element"]').click();
      cy.window().then((win) => {
        const navigationStart = win.performance.timing.navigationStart;
        const now = win.performance.now();
        const interactionDelay = now - (Date.now() - navigationStart);
        expect(interactionDelay).to.be.lessThan(100); // Good FID < 100ms
      });
    });

    it('should load critical resources efficiently', () => {
      cy.visit('/dashboard');

      cy.window().then((win) => {
        // Check resource loading performance
        const resources = win.performance.getEntriesByType('resource');
        
        const cssResources = resources.filter(r => r.name.includes('.css'));
        const jsResources = resources.filter(r => r.name.includes('.js'));
        const imageResources = resources.filter(r => r.name.match(/\.(jpg|jpeg|png|gif|webp)$/));

        // CSS should load quickly
        cssResources.forEach(resource => {
          expect(resource.duration).to.be.lessThan(500);
        });

        // Critical JS should load quickly
        const criticalJS = jsResources.filter(r => r.name.includes('main') || r.name.includes('vendor'));
        criticalJS.forEach(resource => {
          expect(resource.duration).to.be.lessThan(1000);
        });

        // Images should be optimized
        imageResources.forEach(resource => {
          const resourceTiming = resource as any;
          expect(resourceTiming.transferSize || 0).to.be.lessThan(100000); // 100KB max per image
        });
      });
    });

    it('should implement efficient caching strategies', () => {
      // First visit
      cy.visit('/dashboard');
      waitForPageLoad();

      cy.window().then((win) => {
        const initialLoad = win.performance.getEntriesByType('navigation')[0] as any;
        const initialLoadTime = (initialLoad.loadEventEnd || 0) - (initialLoad.loadEventStart || 0);

        // Navigate away and back
        cy.visit('/cases');
        cy.visit('/dashboard');

        cy.window().then((win2) => {
          const secondLoad = win2.performance.getEntriesByType('navigation')[0] as any;
          const secondLoadTime = (secondLoad.loadEventEnd || 0) - (secondLoad.loadEventStart || 0);
          
          // Second load should be faster due to caching
          expect(secondLoadTime).to.be.lessThan(initialLoadTime * 0.8);
        });
      });
    });
  });

  describe('High Volume Data Handling', () => {
    it('should handle large case lists efficiently', () => {
      // Seed with large dataset
      cy.task('seedLargeDataset', { caseCount: 5000 });

      const startTime = performance.now();
      cy.visit('/cases');
      waitForPageLoad();

      // Should load within reasonable time even with large dataset
      cy.then(() => {
        const loadTime = performance.now() - startTime;
        expect(loadTime).to.be.lessThan(3000);
      });

      // Test virtual scrolling performance
      cy.get('[data-testid="cases-list"]').should('be.visible');
      cy.get('[data-testid="case-row"]').should('have.length.at.most', 50); // Virtual scrolling

      // Test scroll performance
      const scrollStartTime = performance.now();
      cy.get('[data-testid="cases-list"]').scrollTo('bottom');
      cy.get('[data-testid="loading-more"]').should('be.visible');
      cy.wait('@loadMoreCases');

      cy.then(() => {
        const scrollTime = performance.now() - scrollStartTime;
        expect(scrollTime).to.be.lessThan(1000);
      });
    });

    it('should handle complex search and filtering efficiently', () => {
      cy.task('seedLargeDataset', { caseCount: 10000 });
      cy.visit('/cases');

      // Test search performance
      const searchStartTime = performance.now();
      cy.get('[data-testid="search-input"]').type('cardiac surgery');
      cy.get('[data-testid="search-button"]').click();
      cy.wait('@searchCases');

      cy.then(() => {
        const searchTime = performance.now() - searchStartTime;
        expect(searchTime).to.be.lessThan(2000);
      });

      // Test multiple filter performance
      const filterStartTime = performance.now();
      selectFromDropdown('status-filter', 'pending');
      selectFromDropdown('priority-filter', 'high');
      selectFromDropdown('assignee-filter', 'current-user');
      cy.get('[data-testid="apply-filters"]').click();
      cy.wait('@getFilteredCases');

      cy.then(() => {
        const filterTime = performance.now() - filterStartTime;
        expect(filterTime).to.be.lessThan(1500);
      });
    });

    it('should handle large file uploads efficiently', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="documents-tab"]').click();

      // Test large file upload performance
      cy.fixture('large-medical-file.pdf', 'base64').then(fileContent => {
        const uploadStartTime = performance.now();
        
        cy.get('[data-testid="file-input"]').attachFile({
          fileContent,
          fileName: 'large-medical-file.pdf',
          mimeType: 'application/pdf',
          encoding: 'base64',
        });

        // Should show progress indicator
        cy.get('[data-testid="upload-progress"]').should('be.visible');
        cy.get('[data-testid="progress-bar"]').should('be.visible');

        cy.wait('@uploadLargeFile', { timeout: 30000 });

        cy.then(() => {
          const uploadTime = performance.now() - uploadStartTime;
          // Upload should complete within reasonable time (adjust based on file size)
          expect(uploadTime).to.be.lessThan(30000);
        });

        cy.get('[data-testid="upload-success"]').should('be.visible');
      });
    });
  });

  describe('Concurrent User Simulation', () => {
    it('should handle multiple simultaneous users', () => {
      // Simulate concurrent users through multiple sessions
      const userCount = 10;
      const promises: Array<Cypress.Chainable> = [];

      for (let i = 0; i < userCount; i++) {
        promises.push(
          cy.task('simulateConcurrentUser', {
            userId: `test-user-${i}`,
            actions: [
              'login',
              'view-dashboard',
              'navigate-to-cases',
              'filter-cases',
              'view-case-details',
              'add-comment',
              'logout'
            ]
          })
        );
      }

      // Wait for all concurrent operations to complete
      cy.wrap(Promise.all(promises)).then((results) => {
        // Verify all users completed successfully
        const resultsArray = results as any[];
        resultsArray.forEach((result: any, index: number) => {
          expect(result).to.have.property('success', true);
          expect(result.userId).to.equal(`test-user-${index}`);
        });
      });

      // Test system stability after concurrent load
      cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
      cy.visit('/dashboard');
      waitForPageLoad();

      // System should still be responsive
      cy.get('[data-testid="dashboard-stats"]').should('be.visible');
      cy.get('[data-testid="response-time"]').should('be.visible');
    });

    it('should maintain data consistency under concurrent access', () => {
      // Create a test case
      cy.task('createTestCase', {
        id: 'concurrent-test-case',
        title: 'Concurrent Access Test',
        status: 'pending'
      });

      // Simulate multiple users accessing the same case
      const concurrentActions = [
        cy.task('simulateUserAction', {
          userId: 'user-1',
          action: 'add-comment',
          caseId: 'concurrent-test-case',
          data: { comment: 'Comment from user 1' }
        }),
        cy.task('simulateUserAction', {
          userId: 'user-2',
          action: 'update-status',
          caseId: 'concurrent-test-case',
          data: { status: 'in_progress' }
        }),
        cy.task('simulateUserAction', {
          userId: 'user-3',
          action: 'add-note',
          caseId: 'concurrent-test-case',
          data: { note: 'Note from user 3' }
        })
      ];

      cy.wrap(Promise.all(concurrentActions)).then(() => {
        // Verify data consistency
        cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
        cy.visit('/cases/concurrent-test-case');

        // All changes should be present and properly ordered
        cy.get('[data-testid="case-status"]').should('contain', 'In Progress');
        cy.get('[data-testid="comments-section"]').should('contain', 'Comment from user 1');
        cy.get('[data-testid="notes-section"]').should('contain', 'Note from user 3');

        // Check audit trail
        cy.get('[data-testid="audit-trail"]').should('be.visible');
        cy.get('[data-testid="audit-entry"]').should('have.length', 3);
      });
    });
  });

  describe('Memory and Resource Management', () => {
    it('should manage memory efficiently during long sessions', () => {
      cy.visit('/dashboard');

      // Monitor initial memory usage
      cy.window().then((win) => {
        const perf = win.performance as any;
        if (perf.memory) {
          const initialMemory = perf.memory.usedJSHeapSize;

          // Simulate long session with many navigations
          const navigationPromises = [];
          for (let i = 0; i < 20; i++) {
            navigationPromises.push(
              cy.visit('/cases').then(() => cy.visit('/dashboard'))
            );
          }

          cy.wrap(Promise.all(navigationPromises)).then(() => {
            cy.window().then((win2) => {
              const perf2 = win2.performance as any;
              if (perf2.memory) {
                const finalMemory = perf2.memory.usedJSHeapSize;
                const memoryIncrease = finalMemory - initialMemory;
                
                // Memory increase should be reasonable (< 50MB)
                expect(memoryIncrease).to.be.lessThan(50 * 1024 * 1024);
              }
            });
          });
        }
      });
    });

    it('should clean up event listeners and subscriptions', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      cy.window().then((win) => {
        const autWin = win as any;
        const initialListeners = autWin.getEventListeners ? 
          Object.keys(autWin.getEventListeners(win)).length : 0;

        // Open and close multiple modals
        for (let i = 0; i < 10; i++) {
          cy.get('[data-testid="edit-case-button"]').click();
          cy.get('[data-testid="modal-close"]').click();
        }

        cy.window().then((win2) => {
          const autWin2 = win2 as any;
          const finalListeners = autWin2.getEventListeners ? 
            Object.keys(autWin2.getEventListeners(win2)).length : 0;

          // Event listeners should not accumulate
          if (initialListeners > 0) {
            expect(finalListeners).to.be.at.most(initialListeners + 5);
          }
        });
      });
    });

    it('should handle WebSocket connections efficiently', () => {
      cy.visit('/dashboard');

      // Monitor WebSocket connection
      cy.window().then((win) => {
        let wsConnections = 0;
        const originalWebSocket = win.WebSocket;
        
        win.WebSocket = new Proxy(originalWebSocket, {
          construct(target, args: any[]) {
            wsConnections++;
            return new (target as any)(...args);
          }
        });

        // Navigate between pages multiple times
        cy.visit('/cases');
        cy.visit('/dashboard');
        cy.visit('/analytics');
        cy.visit('/dashboard');

        cy.then(() => {
          // Should not create excessive WebSocket connections
          expect(wsConnections).to.be.at.most(2);
        });
      });
    });
  });

  describe('Network Performance', () => {
    it('should handle slow network conditions gracefully', () => {
      // Simulate slow 3G connection
      cy.intercept('GET', '/api/**', (req) => {
        req.reply((res) => {
          res.setDelay(2000); // 2 second delay
          res.send();
        });
      }).as('slowApiCall');

      cy.visit('/dashboard');

      // Should show loading indicators
      cy.get('[data-testid="loading-indicator"]').should('be.visible');
      cy.get('[data-testid="skeleton-loader"]').should('be.visible');

      cy.wait('@slowApiCall');

      // Content should eventually load
      cy.get('[data-testid="dashboard-content"]').should('be.visible');
      cy.get('[data-testid="loading-indicator"]').should('not.exist');
    });

    it('should implement efficient API request batching', () => {
      cy.visit('/dashboard');

      // Monitor network requests
      let requestCount = 0;
      cy.intercept('GET', '/api/**', (req) => {
        requestCount++;
        req.reply();
      }).as('apiRequests');

      // Trigger multiple data needs
      cy.get('[data-testid="refresh-stats"]').click();
      cy.get('[data-testid="refresh-activity"]').click();
      cy.get('[data-testid="refresh-notifications"]').click();

      cy.wait(1000);

      cy.then(() => {
        // Should batch requests efficiently (fewer than individual requests)
        expect(requestCount).to.be.lessThan(10);
      });
    });

    it('should cache API responses appropriately', () => {
      cy.visit('/cases');
      waitForPageLoad();

      // Monitor cache hits
      let cacheHits = 0;
      cy.intercept('GET', '/api/cases**', (req) => {
        if (req.headers['if-none-match']) {
          cacheHits++;
          req.reply(304); // Not Modified
        } else {
          req.reply();
        }
      }).as('casesApiCache');

      // Navigate away and back
      cy.visit('/dashboard');
      cy.visit('/cases');

      cy.then(() => {
        // Should have cache hits for repeated requests
        expect(cacheHits).to.be.greaterThan(0);
      });
    });
  });
});