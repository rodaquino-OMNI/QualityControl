// Cross-browser testing utilities and configurations

interface BrowserConfig {
  name: string;
  family: string;
  viewportWidth: number;
  viewportHeight: number;
  userAgent?: string;
  features: string[];
  limitations: string[];
}

export const browserConfigs: Record<string, BrowserConfig> = {
  chrome: {
    name: 'chrome',
    family: 'chromium',
    viewportWidth: 1280,
    viewportHeight: 720,
    features: [
      'modern-js',
      'webgl',
      'css-grid',
      'flexbox',
      'web-components',
      'service-workers'
    ],
    limitations: []
  },
  firefox: {
    name: 'firefox',
    family: 'firefox',
    viewportWidth: 1280,
    viewportHeight: 720,
    features: [
      'modern-js',
      'webgl',
      'css-grid',
      'flexbox',
      'web-components',
      'service-workers'
    ],
    limitations: ['slower-rendering']
  },
  edge: {
    name: 'edge',
    family: 'chromium',
    viewportWidth: 1280,
    viewportHeight: 720,
    features: [
      'modern-js',
      'webgl',
      'css-grid',
      'flexbox',
      'web-components',
      'service-workers'
    ],
    limitations: ['ms-specific-behaviors']
  },
  webkit: {
    name: 'webkit',
    family: 'webkit',
    viewportWidth: 1280,
    viewportHeight: 720,
    features: [
      'modern-js',
      'css-grid',
      'flexbox',
      'web-components'
    ],
    limitations: ['no-service-workers', 'webgl-limited']
  }
};

export const configureBrowserSpecific = () => {
  const browser = Cypress.browser;
  const config = browserConfigs[browser.name];
  
  if (!config) {
    cy.log(`Warning: Unknown browser ${browser.name}, using default configuration`);
    return;
  }

  // Set browser-specific timeouts
  switch (browser.name) {
    case 'firefox':
      Cypress.config('defaultCommandTimeout', 15000);
      Cypress.config('requestTimeout', 15000);
      break;
    case 'webkit':
      Cypress.config('defaultCommandTimeout', 12000);
      Cypress.config('requestTimeout', 12000);
      break;
    default:
      Cypress.config('defaultCommandTimeout', 10000);
      Cypress.config('requestTimeout', 10000);
  }

  // Set browser-specific viewport
  cy.viewport(config.viewportWidth, config.viewportHeight);

  cy.log(`Configured for ${browser.name} (${browser.family})`);
  cy.log(`Features: ${config.features.join(', ')}`);
  if (config.limitations.length > 0) {
    cy.log(`Limitations: ${config.limitations.join(', ')}`);
  }
};

// Browser-specific test utilities
export const skipOn = (browsers: string[], reason?: string) => {
  if (browsers.includes(Cypress.browser.name)) {
    cy.log(`Skipping test on ${Cypress.browser.name}${reason ? `: ${reason}` : ''}`);
    return true;
  }
  return false;
};

export const runOnlyOn = (browsers: string[], reason?: string) => {
  if (!browsers.includes(Cypress.browser.name)) {
    cy.log(`Skipping test - only runs on ${browsers.join(', ')}${reason ? `: ${reason}` : ''}`);
    return false;
  }
  return true;
};

// Browser feature detection
export const browserSupports = (feature: string): boolean => {
  const config = browserConfigs[Cypress.browser.name];
  return config ? config.features.includes(feature) : false;
};

export const browserHasLimitation = (limitation: string): boolean => {
  const config = browserConfigs[Cypress.browser.name];
  return config ? config.limitations.includes(limitation) : false;
};

// Cross-browser compatibility checks
export const checkCrossBrowserCompatibility = () => {
  describe('Cross-Browser Compatibility', () => {
    beforeEach(() => {
      configureBrowserSpecific();
    });

    it('should handle browser-specific differences', () => {
      cy.visit('/dashboard');
      
      // Check CSS Grid support
      if (browserSupports('css-grid')) {
        cy.get('[data-testid="grid-layout"]').should('have.css', 'display', 'grid');
      } else {
        cy.get('[data-testid="fallback-layout"]').should('be.visible');
      }

      // Check Service Worker support
      if (browserSupports('service-workers')) {
        cy.window().its('navigator.serviceWorker').should('exist');
      }

      // Handle slower rendering in Firefox
      if (browserHasLimitation('slower-rendering')) {
        cy.wait(1000); // Additional wait for Firefox
      }
    });

    it('should handle font rendering differences', () => {
      cy.visit('/dashboard');
      
      // Take browser-specific screenshot for font comparison
      const browserName = Cypress.browser.name;
      cy.compareSnapshot(`font-rendering-${browserName}`, {
        threshold: browserName === 'firefox' ? 0.3 : 0.1,
        thresholdType: 'percent'
      });
    });

    it('should handle form input differences', () => {
      cy.visit('/cases');
      cy.get('[data-testid="create-case-button"]').click();

      // Date inputs render differently across browsers
      cy.get('[data-testid="service-date-input"]').then(($input) => {
        const inputType = $input.attr('type');
        
        if (inputType === 'date' && browserSupports('modern-js')) {
          // Modern browsers support date input
          cy.wrap($input).should('have.attr', 'type', 'date');
        } else {
          // Fallback to text input with date picker
          cy.wrap($input).should('have.attr', 'type', 'text');
          cy.get('[data-testid="date-picker-fallback"]').should('be.visible');
        }
      });
    });

    it('should handle animation performance', () => {
      cy.visit('/analytics');
      
      // Reduce animations on slower browsers
      if (browserHasLimitation('slower-rendering')) {
        cy.window().then((win) => {
          win.document.documentElement.style.setProperty('--animation-duration', '0s');
        });
      }

      // Wait longer for chart animations on Firefox
      const waitTime = Cypress.browser.name === 'firefox' ? 3000 : 2000;
      cy.wait(waitTime);
      
      cy.get('[data-testid="chart-loading"]').should('not.exist');
    });
  });
};

// Browser-specific workarounds
export const applyBrowserWorkarounds = () => {
  const browser = Cypress.browser;

  if (browser.name === 'firefox') {
    // Firefox-specific workarounds
    cy.window().then((win) => {
      // Reduce motion for better test stability
      win.document.documentElement.style.setProperty('--motion-reduce', 'true');
    });
  }

  if (browser.name === 'webkit') {
    // WebKit-specific workarounds
    cy.window().then((win) => {
      // Handle WebKit scrolling differences
      win.document.documentElement.style.setProperty('-webkit-overflow-scrolling', 'touch');
    });
  }

  if (browser.family === 'chromium') {
    // Chromium-based browser optimizations
    cy.window().then((win) => {
      // Enable hardware acceleration
      win.document.documentElement.style.setProperty('transform', 'translateZ(0)');
    });
  }
};

// Performance testing across browsers
export const measureBrowserPerformance = (testName: string) => {
  const browser = Cypress.browser;
  
  cy.window().then((win) => {
    win.performance.mark(`${testName}-start`);
  });

  return {
    end: () => {
      cy.window().then((win) => {
        win.performance.mark(`${testName}-end`);
        win.performance.measure(testName, `${testName}-start`, `${testName}-end`);
        
        const measure = win.performance.getEntriesByName(testName)[0];
        const duration = measure.duration;
        
        cy.log(`${testName} performance on ${browser.name}: ${duration.toFixed(2)}ms`);
        
        // Set browser-specific performance expectations
        let maxDuration = 5000; // Default
        if (browser.name === 'firefox') {
          maxDuration = 7000; // Firefox typically slower
        } else if (browser.name === 'webkit') {
          maxDuration = 6000; // WebKit moderate performance
        }
        
        expect(duration).to.be.lessThan(maxDuration);
      });
    }
  };
};

// Export browser configuration for use in tests
export const getCurrentBrowserConfig = () => {
  return browserConfigs[Cypress.browser.name] || browserConfigs.chrome;
};

// Helper to conditionally run assertions based on browser
export const conditionalAssert = (
  assertion: () => void,
  condition: 'browser' | 'feature',
  value: string
) => {
  let shouldRun = false;

  if (condition === 'browser') {
    shouldRun = Cypress.browser.name === value;
  } else if (condition === 'feature') {
    shouldRun = browserSupports(value);
  }

  if (shouldRun) {
    assertion();
  } else {
    cy.log(`Skipping assertion - ${condition}: ${value} not met`);
  }
};