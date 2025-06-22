// Enhanced Cypress Commands for AUSTA Cockpit E2E Testing

declare global {
  namespace Cypress {
    interface Chainable {
      // Performance monitoring commands
      measurePageLoadTime(): Chainable<number>;
      measureInteractionTime(selector: string, action?: string): Chainable<number>;
      checkCoreWebVitals(): Chainable<{fcp: number, lcp: number, cls: number}>;
      
      // Accessibility testing commands
      checkA11yCompliance(options?: any): Chainable<void>;
      testKeyboardNavigation(selectors: string[]): Chainable<void>;
      verifyAriaLabels(selector: string): Chainable<void>;
      
      // User journey commands
      completeOnboarding(userData: any): Chainable<void>;
      performDailyWorkflow(caseId?: string): Chainable<void>;
      simulateConcurrentUser(actions: string[]): Chainable<any>;
      
      // Data management commands
      seedLargeDataset(options: {caseCount: number}): Chainable<void>;
      createComplexCase(caseData: any): Chainable<any>;
      setupUserRole(role: string, permissions?: string[]): Chainable<void>;
      
      // Network and performance commands
      simulateSlowNetwork(delay?: number): Chainable<void>;
      monitorNetworkRequests(): Chainable<any>;
      validateCaching(url: string): Chainable<boolean>;
      
      // Visual and UI commands
      compareVisualSnapshot(name: string, options?: any): Chainable<void>;
      testResponsiveLayout(breakpoints: string[]): Chainable<void>;
      verifyLoadingStates(selector: string): Chainable<void>;
      
      // Cross-browser compatibility commands
      checkBrowserFeatureSupport(features: string[]): Chainable<any>;
      validateCSSRendering(selector: string): Chainable<void>;
      testMobileInteractions(): Chainable<void>;
    }
  }
}

// Performance monitoring commands
Cypress.Commands.add('measurePageLoadTime', () => {
  return cy.window().then((win) => {
    const navigation = win.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const loadTime = navigation.loadEventEnd - navigation.loadEventStart;
    return cy.wrap(loadTime);
  });
});

Cypress.Commands.add('measureInteractionTime', (selector: string, action: string = 'click') => {
  const startTime = performance.now();
  return cy.get(selector).then(($el) => {
    if (action === 'click') {
      cy.wrap($el).click();
    } else if (action === 'type') {
      cy.wrap($el).type('test');
    }
    const endTime = performance.now();
    return cy.wrap(endTime - startTime);
  });
});

Cypress.Commands.add('checkCoreWebVitals', () => {
  return cy.window().then((win) => {
    return new Promise<{ fcp: number; lcp: number; cls: number }>((resolve) => {
      const metrics = { fcp: 0, lcp: 0, cls: 0 };
      
      // First Contentful Paint
      const fcpEntry = win.performance.getEntriesByName('first-contentful-paint')[0];
      if (fcpEntry) metrics.fcp = fcpEntry.startTime;
      
      // Largest Contentful Paint
      new win.PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) metrics.lcp = lastEntry.startTime;
      }).observe({ entryTypes: ['largest-contentful-paint'] });
      
      // Cumulative Layout Shift
      let clsValue = 0;
      new win.PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
        metrics.cls = clsValue;
        resolve(metrics);
      }).observe({ entryTypes: ['layout-shift'] });
      
      // Fallback timeout
      setTimeout(() => resolve(metrics), 5000);
    });
  });
});

// Accessibility testing commands
Cypress.Commands.add('checkA11yCompliance', (options = {}) => {
  cy.injectAxe();
  cy.checkA11y(undefined, {
    rules: {
      'color-contrast': { enabled: true },
      'keyboard-navigation': { enabled: true },
      'aria-labels': { enabled: true },
    },
    ...options
  });
});

Cypress.Commands.add('testKeyboardNavigation', (selectors: string[]) => {
  selectors.forEach((selector, index) => {
    if (index === 0) {
      cy.get(selector).focus();
    } else {
      cy.tab();
    }
    cy.focused().should('match', selector);
  });
});

Cypress.Commands.add('verifyAriaLabels', (selector: string) => {
  cy.get(selector).should('satisfy', ($el) => {
    const element = $el[0];
    return element.hasAttribute('aria-label') ||
           element.hasAttribute('aria-labelledby') ||
           element.hasAttribute('aria-describedby') ||
           element.tagName.toLowerCase() === 'label';
  });
});

// User journey commands
Cypress.Commands.add('completeOnboarding', (userData: any) => {
  // Step 1: Registration
  cy.visit('/register');
  Object.keys(userData).forEach(key => {
    cy.get(`#${key}, [name="${key}"]`).first().type(userData[key]);
  });
  cy.get('input[type="checkbox"]:contains("terms"), #terms, [name="terms"]').first().check();
  cy.get('button[type="submit"], button:contains("Register")').click();
  
  // Step 2: Email verification (simulated)
  cy.task('verifyUserEmail', { email: userData.email });
  
  // Step 3: Login and complete wizard
  cy.visit('/login');
  cy.get('#email').type(userData.email);
  cy.get('#password').type(userData.password);
  cy.get('button[type="submit"]').click();
  
  // Complete onboarding wizard
  cy.get('button:contains("Skip"), .skip-onboarding').first().click();
});

Cypress.Commands.add('performDailyWorkflow', (caseId?: string) => {
  cy.visit('/dashboard');
  cy.get('.card, .stats-card, h1:contains("Dashboard")').should('be.visible');
  
  if (caseId) {
    cy.visit(`/cases/${caseId}`);
  } else {
    cy.visit('/cases');
    cy.get('.case-list-item, .card').first().click();
  }
  
  // Perform case review
  cy.get('button:contains("Start Review"), .start-review').first().click();
  cy.get('button:contains("AI Analysis"), .ai-analysis-tab').first().click();
  cy.get('button:contains("Start Analysis"), .start-analysis').first().click();
  cy.wait('@performAIAnalysis');
  
  // Make decision
  cy.get('button:contains("Decision"), .decision-tab').first().click();
  cy.get('button:contains("Approve"), .decision-approve').first().click();
  cy.get('textarea, .decision-rationale').first().type('Case approved based on comprehensive review');
  cy.get('button:contains("Submit"), .submit-decision').first().click();
});

Cypress.Commands.add('simulateConcurrentUser', (actions: string[]) => {
  return cy.task('simulateConcurrentUser', { actions });
});

// Data management commands
Cypress.Commands.add('seedLargeDataset', (options: {caseCount: number}) => {
  return cy.task('seedLargeDataset', options);
});

Cypress.Commands.add('createComplexCase', (caseData: any) => {
  return cy.task('createComplexCase', caseData);
});

Cypress.Commands.add('setupUserRole', (role: string, permissions: string[] = []) => {
  return cy.task('setupUserRole', { role, permissions });
});

// Network and performance commands
Cypress.Commands.add('simulateSlowNetwork', (delay: number = 2000) => {
  cy.intercept('**', (req) => {
    req.reply((res) => {
      res.delay(delay);
      res.send();
    });
  });
});

Cypress.Commands.add('monitorNetworkRequests', () => {
  const requests: any[] = [];
  cy.intercept('**', (req) => {
    requests.push({
      url: req.url,
      method: req.method,
      timestamp: Date.now()
    });
    req.reply();
  });
  return cy.wrap(requests);
});

Cypress.Commands.add('validateCaching', (url: string) => {
  let isCached = false;
  cy.intercept('GET', url, (req) => {
    if (req.headers['if-none-match'] || req.headers['if-modified-since']) {
      isCached = true;
      req.reply(304);
    } else {
      req.reply();
    }
  });
  
  // First request
  cy.request('GET', url);
  // Second request should use cache
  cy.request('GET', url);
  
  return cy.wrap(isCached);
});

// Visual and UI commands
Cypress.Commands.add('compareVisualSnapshot', (name: string, options = {}) => {
  cy.compareSnapshot(name, {
    threshold: 0.2,
    thresholdType: 'percent',
    ...options
  });
});

Cypress.Commands.add('testResponsiveLayout', (breakpoints: string[]) => {
  breakpoints.forEach(breakpoint => {
    cy.viewport(breakpoint as any);
    cy.get('main, .main-content, #root').should('be.visible');
    
    // Check mobile-specific elements
    if (breakpoint.includes('iphone') || breakpoint.includes('android')) {
      cy.get('.mobile-menu, .hamburger-menu, button[aria-label*="menu"]').should('be.visible');
      cy.get('.sidebar, .desktop-sidebar').should('not.be.visible');
    } else {
      cy.get('.sidebar, .desktop-sidebar').should('be.visible');
      cy.get('.mobile-menu, .hamburger-menu').should('not.be.visible');
    }
  });
});

Cypress.Commands.add('verifyLoadingStates', (selector: string) => {
  // Check loading state appears
  cy.get(`${selector} .spinner, ${selector} .loading, ${selector} [role="progressbar"]`).should('be.visible');
  
  // Check loading state disappears
  cy.get(`${selector} .spinner, ${selector} .loading, ${selector} [role="progressbar"]`).should('not.exist');
  
  // Check content appears
  cy.get(`${selector}`).should('be.visible').and('not.be.empty');
});

// Cross-browser compatibility commands
Cypress.Commands.add('checkBrowserFeatureSupport', (features: string[]) => {
  return cy.window().then((win) => {
    const support: any = {};
    
    features.forEach(feature => {
      switch (feature) {
        case 'webgl':
          support.webgl = !!win.WebGLRenderingContext;
          break;
        case 'websocket':
          support.websocket = !!win.WebSocket;
          break;
        case 'localstorage':
          support.localstorage = !!win.localStorage;
          break;
        case 'flexbox':
          support.flexbox = CSS.supports('display', 'flex');
          break;
        case 'grid':
          support.grid = CSS.supports('display', 'grid');
          break;
        case 'customproperties':
          support.customproperties = CSS.supports('--test', 'value');
          break;
      }
    });
    
    return support;
  });
});

Cypress.Commands.add('validateCSSRendering', (selector: string) => {
  cy.get(selector).should(($el) => {
    const element = $el[0];
    const styles = window.getComputedStyle(element);
    
    // Check that styles are applied
    expect(styles.display).to.not.equal('');
    expect(styles.visibility).to.not.equal('hidden');
    
    // Check for common CSS issues
    if (styles.position === 'fixed' || styles.position === 'absolute') {
      expect(parseInt(styles.zIndex)).to.be.at.least(0);
    }
    
    // Check for proper box model
    if (styles.boxSizing) {
      expect(styles.boxSizing).to.equal('border-box');
    }
  });
});

Cypress.Commands.add('testMobileInteractions', () => {
  cy.viewport('iphone-x');
  
  // Test touch events on main interactive elements
  cy.get('button, a, .card').first().trigger('touchstart');
  cy.get('button, a, .card').first().trigger('touchend');
  
  // Test swipe gestures on swipeable content
  cy.get('.swipeable, .carousel, .slider').first()
    .trigger('touchstart', { clientX: 300, clientY: 100 })
    .trigger('touchmove', { clientX: 100, clientY: 100 })
    .trigger('touchend');
  
  // Test pinch zoom on zoomable content
  cy.get('.zoomable, .chart, img').first()
    .trigger('touchstart', { touches: [{ clientX: 100, clientY: 100 }, { clientX: 200, clientY: 200 }] })
    .trigger('touchmove', { touches: [{ clientX: 50, clientY: 50 }, { clientX: 250, clientY: 250 }] })
    .trigger('touchend');
});

export {};