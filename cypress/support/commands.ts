// ***********************************************
// Custom commands for AUSTA Cockpit E2E tests
// ***********************************************

import 'cypress-file-upload';

// Authentication commands
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.session([email, password], () => {
    cy.visit('/login');
    cy.get('#email').type(email);
    cy.get('#password').type(password);
    cy.get('button[type="submit"]').click();
    
    // Wait for authentication to complete
    cy.url().should('not.include', '/login');
    cy.window().its('localStorage.token').should('exist');
  });
});

Cypress.Commands.add('logout', () => {
  cy.get('[aria-label="User menu"], .user-menu, button:contains("Logout")').first().click();
  cy.url().should('include', '/login');
});

// Case management commands
Cypress.Commands.add('createCase', (caseData) => {
  const defaultCase = {
    title: 'Test Case',
    description: 'Test case description',
    priority: 'medium',
    patientId: 'TEST123',
    ...caseData,
  };
  
  cy.request('POST', `${Cypress.env('apiUrl')}/cases`, defaultCase)
    .then((response) => {
      expect(response.status).to.eq(201);
      return response.body.data;
    });
});

// API helper commands
Cypress.Commands.add('waitForApi', (alias: string) => {
  cy.intercept('GET', `**/api/**`).as('apiCall');
  cy.wait(`@${alias}`, { timeout: 10000 });
});

// Accessibility testing
Cypress.Commands.add('checkAccessibility', () => {
  cy.injectAxe();
  cy.checkA11y(undefined, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa'],
    },
  });
});

// Database seeding commands
Cypress.Commands.add('seedDatabase', () => {
  cy.task('seedDatabase').then(() => {
    cy.log('Database seeded successfully');
  });
});

Cypress.Commands.add('cleanupDatabase', () => {
  cy.task('cleanupDatabase').then(() => {
    cy.log('Database cleaned up successfully');
  });
});

// Utility functions for common operations
export const waitForPageLoad = () => {
  cy.get('.loading, [role="progressbar"], .spinner').should('not.exist');
  cy.get('body').should('be.visible');
};

export const selectFromDropdown = (dropdownSelector: string, value: string) => {
  cy.get(`select[name="${dropdownSelector}"], .${dropdownSelector}, #${dropdownSelector}`).first().select(value);
};

export const checkNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
  const colorClass = type === 'success' ? '.text-green-800' : type === 'error' ? '.text-red-800' : '.text-blue-800';
  cy.get(`${colorClass}, .notification, .alert`)
    .should('be.visible')
    .and('contain', message);
};

export const uploadFile = (fileInputTestId: string, fileName: string, fileType = 'application/pdf') => {
  cy.fixture(fileName, 'base64').then(fileContent => {
    cy.get(`[data-testid="${fileInputTestId}"]`).attachFile({
      fileContent,
      fileName,
      mimeType: fileType,
      encoding: 'base64',
    });
  });
};

// API interceptor helpers
export const setupApiInterceptors = () => {
  // Auth endpoints
  cy.intercept('POST', '**/api/auth/login', { fixture: 'auth/login.json' }).as('login');
  cy.intercept('POST', '**/api/auth/logout', { statusCode: 204 }).as('logout');
  
  // Cases endpoints
  cy.intercept('GET', '**/api/cases', { fixture: 'cases/list.json' }).as('getCases');
  cy.intercept('GET', '**/api/cases/*', { fixture: 'cases/single.json' }).as('getCase');
  cy.intercept('POST', '**/api/cases', { fixture: 'cases/create.json' }).as('createCase');
  cy.intercept('PUT', '**/api/cases/*', { fixture: 'cases/update.json' }).as('updateCase');
  
  // AI analysis endpoints
  cy.intercept('POST', '**/api/ai/analyze/*', { fixture: 'ai/analysis.json' }).as('analyzeCase');
  cy.intercept('POST', '**/api/ai/report/*', { fixture: 'ai/report.json' }).as('generateReport');
};

// Form validation helpers
export const checkFormValidation = (fieldTestId: string, errorMessage: string) => {
  cy.get(`[data-testid="${fieldTestId}-error"]`)
    .should('be.visible')
    .and('contain', errorMessage);
};

export const fillForm = (formData: Record<string, any>) => {
  Object.entries(formData).forEach(([field, value]) => {
    if (typeof value === 'string') {
      cy.get(`#${field}, [name="${field}"], .${field}-input`).first().clear().type(value);
    } else if (typeof value === 'boolean') {
      cy.get(`#${field}, [name="${field}"], .${field}-checkbox`).first().check();
    } else if (Array.isArray(value)) {
      value.forEach(v => {
        cy.get(`#${field}, [name="${field}"], .${field}-select`).first().select(v);
      });
    }
  });
};

// Enhanced authentication commands
Cypress.Commands.add('loginAs', (role: string) => {
  const users = Cypress.env('testUsers');
  const user = users[role];
  
  if (!user) {
    throw new Error(`User role '${role}' not found in test configuration`);
  }
  
  cy.login(user.email, user.password);
});

Cypress.Commands.add('loginWithMFA', (email: string, password: string, mfaCode: string) => {
  cy.session([email, password, mfaCode], () => {
    cy.visit('/login');
    cy.get('[data-testid="email-input"]').type(email);
    cy.get('[data-testid="password-input"]').type(password);
    cy.get('[data-testid="login-button"]').click();
    
    // Handle MFA if prompted
    cy.url().then((url) => {
      if (url.includes('/mfa-verify')) {
        cy.get('[data-testid="mfa-code-input"]').type(mfaCode);
        cy.get('[data-testid="verify-mfa-button"]').click();
      }
    });
    
    cy.url().should('not.include', '/login');
    cy.url().should('not.include', '/mfa-verify');
    cy.window().its('localStorage.authToken').should('exist');
  });
});

// Enhanced case management commands
Cypress.Commands.add('createCaseWithData', (caseData: any) => {
  const defaultCase = {
    title: 'Test Case',
    description: 'Test case description',
    priority: 'medium',
    patientId: 'TEST123',
    procedureCode: '99213',
    diagnosisCode: 'Z00.00',
    claimAmount: 1000,
    ...caseData,
  };
  
  return cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/cases`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`,
    },
    body: defaultCase,
  }).then((response) => {
    expect(response.status).to.eq(201);
    return response.body.data;
  });
});

Cypress.Commands.add('updateCaseStatus', (caseId: string, status: string) => {
  return cy.request({
    method: 'PATCH',
    url: `${Cypress.env('apiUrl')}/cases/${caseId}`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`,
    },
    body: { status },
  });
});

// Enhanced API testing commands
Cypress.Commands.add('apiRequest', (method: string, endpoint: string, body?: any) => {
  return cy.request({
    method,
    url: `${Cypress.env('apiUrl')}${endpoint}`,
    headers: {
      'Authorization': `Bearer ${window.localStorage.getItem('authToken')}`,
      'Content-Type': 'application/json',
    },
    body,
    failOnStatusCode: false,
  });
});

// Visual regression testing commands
Cypress.Commands.add('compareSnapshot', (name: string, options?: any) => {
  cy.compareSnapshot(name, {
    threshold: 0.1,
    thresholdType: 'percent',
    ...options,
  });
});

Cypress.Commands.add('takeScreenshotOnFail', () => {
  cy.screenshot(`failed-${Cypress.currentTest.title}`, {
    capture: 'viewport',
    onAfterScreenshot: (_el, props) => {
      console.log('Screenshot taken:', props.path);
    },
  });
});

// Data setup and teardown commands
Cypress.Commands.add('setupTestData', (dataType: string) => {
  return cy.task('setupTestData', dataType);
});

Cypress.Commands.add('cleanupTestData', (dataType?: string) => {
  return cy.task('cleanupTestData', dataType || 'all');
});

// Performance testing commands
Cypress.Commands.add('measurePageLoad', (pageName: string) => {
  cy.window().then((win) => {
    const start = win.performance.now();
    cy.wrap(start).as('loadStart');
  });
  
  cy.get('[data-testid="page-loaded"]').should('be.visible');
  
  cy.window().then((win) => {
    const end = win.performance.now();
    cy.get('@loadStart').then((start: any) => {
      const loadTime = end - start;
      cy.log(`${pageName} load time: ${loadTime.toFixed(2)}ms`);
      
      // Assert reasonable load time (adjust threshold as needed)
      expect(loadTime).to.be.lessThan(5000);
    });
  });
});

// Cross-browser testing helpers
Cypress.Commands.add('skipOnBrowser', (browser: string) => {
  if (Cypress.browser.name === browser) {
    cy.log(`Skipping test on ${browser}`);
    return;
  }
});

// Enhanced form interaction commands
export const fillFormWithValidation = (formData: Record<string, any>, validateFields: boolean = true) => {
  Object.entries(formData).forEach(([field, value]) => {
    cy.get(`[data-testid="${field}-input"]`).clear();
    
    if (value) {
      cy.get(`[data-testid="${field}-input"]`).type(value.toString());
      
      if (validateFields) {
        // Check that field doesn't have error after valid input
        cy.get(`[data-testid="${field}-error"]`).should('not.exist');
      }
    }
  });
};

export const waitForApiResponse = (alias: string, timeout: number = 10000) => {
  cy.wait(`@${alias}`, { timeout });
  cy.get('@' + alias).should((xhr: any) => {
    expect(xhr.response.statusCode).to.be.oneOf([200, 201, 204]);
  });
};

export const retryUntilVisible = (selector: string, maxRetries: number = 5) => {
  let attempts = 0;
  
  const checkElement = () => {
    attempts++;
    cy.get('body').then(($body) => {
      if ($body.find(selector).length > 0) {
        cy.get(selector).should('be.visible');
      } else if (attempts < maxRetries) {
        cy.wait(1000);
        checkElement();
      } else {
        throw new Error(`Element ${selector} not found after ${maxRetries} attempts`);
      }
    });
  };
  
  checkElement();
};

export const dragAndDrop = (sourceSelector: string, targetSelector: string) => {
  cy.get(sourceSelector).trigger('mousedown', { button: 0 });
  cy.get(targetSelector).trigger('mousemove').trigger('mouseup');
};

export const assertTableData = (tableSelector: string, expectedData: any[][]) => {
  cy.get(tableSelector).within(() => {
    expectedData.forEach((rowData, rowIndex) => {
      cy.get('tr').eq(rowIndex + 1).within(() => { // +1 to skip header
        rowData.forEach((cellData, cellIndex) => {
          cy.get('td').eq(cellIndex).should('contain', cellData);
        });
      });
    });
  });
};

export const interceptAllApiCalls = () => {
  // Auth endpoints
  cy.intercept('POST', '**/api/auth/login', { fixture: 'auth/login.json' }).as('login');
  cy.intercept('POST', '**/api/auth/logout', { statusCode: 204 }).as('logout');
  cy.intercept('POST', '**/api/auth/refresh', { fixture: 'auth/refresh.json' }).as('refreshToken');
  cy.intercept('POST', '**/api/auth/mfa/verify', { fixture: 'auth/mfa-verify.json' }).as('verifyMFA');
  
  // Cases endpoints
  cy.intercept('GET', '**/api/cases', { fixture: 'cases/list.json' }).as('getCases');
  cy.intercept('GET', '**/api/cases/*', { fixture: 'cases/single.json' }).as('getCase');
  cy.intercept('POST', '**/api/cases', { fixture: 'cases/create.json' }).as('createCase');
  cy.intercept('PUT', '**/api/cases/*', { fixture: 'cases/update.json' }).as('updateCase');
  cy.intercept('DELETE', '**/api/cases/*', { statusCode: 204 }).as('deleteCase');
  
  // AI analysis endpoints
  cy.intercept('POST', '**/api/ai/analyze/*', { fixture: 'ai/analysis.json' }).as('analyzeCase');
  cy.intercept('GET', '**/api/ai/analysis/*', { fixture: 'ai/analysis.json' }).as('getAnalysis');
  cy.intercept('POST', '**/api/ai/report/*', { fixture: 'ai/report.json' }).as('generateReport');
  
  // User management endpoints
  cy.intercept('GET', '**/api/users', { fixture: 'users/list.json' }).as('getUsers');
  cy.intercept('POST', '**/api/users', { fixture: 'users/create.json' }).as('createUser');
  cy.intercept('PUT', '**/api/users/*', { fixture: 'users/update.json' }).as('updateUser');
  
  // Fraud detection endpoints
  cy.intercept('POST', '**/api/fraud/analyze', { fixture: 'fraud/analysis.json' }).as('analyzeFraud');
  cy.intercept('GET', '**/api/fraud/alerts', { fixture: 'fraud/alerts.json' }).as('getFraudAlerts');
  
  // Analytics endpoints
  cy.intercept('GET', '**/api/analytics/dashboard', { fixture: 'analytics/dashboard.json' }).as('getDashboard');
  cy.intercept('GET', '**/api/analytics/metrics', { fixture: 'analytics/metrics.json' }).as('getMetrics');
  
  // File upload endpoints
  cy.intercept('POST', '**/api/files/upload', { fixture: 'files/upload.json' }).as('uploadFile');
  
  // Health check
  cy.intercept('GET', '**/api/health', { 
    body: { status: 'healthy', timestamp: new Date().toISOString() }
  }).as('health');
};

// Tab navigation command
Cypress.Commands.add('tab', (options?: { shift?: boolean }) => {
  const tabKey = options?.shift ? '{shift}{tab}' : '{tab}';
  return cy.focused().type(tabKey);
});