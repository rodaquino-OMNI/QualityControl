import { waitForPageLoad, selectFromDropdown, checkNotification } from '../support/commands';

describe('Cases Management', () => {
  beforeEach(() => {
    cy.login('test@example.com', 'TestPassword123!');
    cy.visit('/cases');
    waitForPageLoad();
  });

  describe('Cases List', () => {
    it('should display cases list', () => {
      cy.get('.case-list-item, .card').should('be.visible');
      cy.get('.case-list-item').should('have.length.greaterThan', 0);
    });

    it('should filter cases by status', () => {
      selectFromDropdown('status-filter', 'pending');
      cy.wait('@getCases');
      
      cy.get('.status-badge').each(($el) => {
        cy.wrap($el).should('contain', 'Open');
      });
    });

    it('should filter cases by priority', () => {
      selectFromDropdown('priority-filter', 'high');
      cy.wait('@getCases');
      
      cy.get('.priority-high').each(($el) => {
        cy.wrap($el).should('contain', 'HIGH');
      });
    });

    it('should search cases by title', () => {
      cy.get('input[type="search"], .search-input, #search').type('cardiac');
      cy.get('button:contains("Search"), .search-button').click();
      cy.wait('@getCases');
      
      cy.get('h3').each(($el) => {
        cy.wrap($el).should('contain.text', 'cardiac', { matchCase: false });
      });
    });

    it('should sort cases by date', () => {
      cy.get('[data-testid="sort-date"]').click();
      cy.wait('@getCases');
      
      let previousDate: Date;
      cy.get('[data-testid="case-date"]').each(($el) => {
        const currentDate = new Date($el.text());
        if (previousDate) {
          expect(currentDate.getTime()).to.be.lessThan(previousDate.getTime());
        }
        previousDate = currentDate;
      });
    });

    it('should paginate cases', () => {
      cy.get('[data-testid="pagination-next"]').click();
      cy.wait('@getCases');
      cy.url().should('include', 'page=2');
      
      cy.get('[data-testid="pagination-prev"]').click();
      cy.wait('@getCases');
      cy.url().should('include', 'page=1');
    });
  });

  describe('Create Case', () => {
    it('should open create case modal', () => {
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="create-case-modal"]').should('be.visible');
    });

    it('should validate required fields', () => {
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="submit-button"]').click();
      
      cy.get('[data-testid="title-error"]').should('contain', 'Title is required');
      cy.get('[data-testid="patient-id-error"]').should('contain', 'Patient ID is required');
    });

    it('should create a new case', () => {
      cy.get('[data-testid="create-case-button"]').click();
      
      // Fill form
      cy.get('[data-testid="title-input"]').type('New Medical Audit Case');
      cy.get('[data-testid="description-input"]').type('Patient requires comprehensive review');
      selectFromDropdown('priority-select', 'high');
      cy.get('[data-testid="patient-id-input"]').type('PT123456');
      cy.get('[data-testid="medical-record-input"]').type('MRN789012');
      
      // Add diagnosis codes
      cy.get('[data-testid="add-diagnosis-button"]').click();
      cy.get('[data-testid="diagnosis-code-0"]').type('E11.9');
      
      // Submit
      cy.get('[data-testid="submit-button"]').click();
      cy.wait('@createCase');
      
      checkNotification('Case created successfully', 'success');
      cy.get('[data-testid="create-case-modal"]').should('not.exist');
    });
  });

  describe('Case Details', () => {
    it('should navigate to case details', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.url().should('match', /\/cases\/\d+/);
      cy.get('[data-testid="case-details"]').should('be.visible');
    });

    it('should display case information', () => {
      cy.get('[data-testid="case-row"]').first().click();
      
      cy.get('[data-testid="case-title"]').should('be.visible');
      cy.get('[data-testid="case-status"]').should('be.visible');
      cy.get('[data-testid="case-priority"]').should('be.visible');
      cy.get('[data-testid="patient-info"]').should('be.visible');
    });

    it('should update case status', () => {
      cy.get('[data-testid="case-row"]').first().click();
      
      cy.get('[data-testid="status-dropdown"]').click();
      cy.get('[data-testid="status-in_progress"]').click();
      cy.wait('@updateCase');
      
      checkNotification('Case status updated', 'success');
      cy.get('[data-testid="case-status"]').should('contain', 'In Progress');
    });
  });

  describe('AI Analysis', () => {
    beforeEach(() => {
      cy.get('[data-testid="case-row"]').first().click();
    });

    it('should trigger AI analysis', () => {
      cy.get('[data-testid="analyze-button"]').click();
      cy.get('[data-testid="analysis-modal"]').should('be.visible');
      
      selectFromDropdown('analysis-type', 'comprehensive');
      cy.get('[data-testid="include-recommendations"]').check();
      cy.get('[data-testid="start-analysis"]').click();
      
      cy.wait('@analyzeCase');
      cy.get('[data-testid="analysis-results"]').should('be.visible');
    });

    it('should display analysis results', () => {
      cy.get('[data-testid="analyze-button"]').click();
      cy.get('[data-testid="start-analysis"]').click();
      cy.wait('@analyzeCase');
      
      cy.get('[data-testid="risk-score"]').should('be.visible');
      cy.get('[data-testid="findings-list"]').should('be.visible');
      cy.get('[data-testid="recommendations-list"]').should('be.visible');
    });

    it('should generate audit report', () => {
      cy.get('[data-testid="generate-report-button"]').click();
      cy.wait('@generateReport');
      
      cy.get('[data-testid="report-preview"]').should('be.visible');
      cy.get('[data-testid="download-report"]').should('be.visible');
    });
  });

  describe('File Upload', () => {
    beforeEach(() => {
      cy.get('[data-testid="case-row"]').first().click();
    });

    it('should upload medical records', () => {
      cy.get('[data-testid="upload-tab"]').click();
      
      // Upload file
      cy.fixture('medical-record.pdf', 'base64').then(fileContent => {
        cy.get('[data-testid="file-upload"]').attachFile({
          fileContent,
          fileName: 'medical-record.pdf',
          mimeType: 'application/pdf',
          encoding: 'base64',
        });
      });
      
      cy.get('[data-testid="upload-button"]').click();
      cy.wait('@uploadFile');
      
      checkNotification('File uploaded successfully', 'success');
      cy.get('[data-testid="file-list"]').should('contain', 'medical-record.pdf');
    });

    it('should validate file types', () => {
      cy.get('[data-testid="upload-tab"]').click();
      
      // Try to upload invalid file type
      cy.fixture('invalid.exe', 'base64').then(fileContent => {
        cy.get('[data-testid="file-upload"]').attachFile({
          fileContent,
          fileName: 'invalid.exe',
          mimeType: 'application/x-msdownload',
          encoding: 'base64',
        });
      });
      
      cy.get('[data-testid="file-error"]').should('contain', 'Invalid file type');
    });
  });

  describe('Collaboration', () => {
    beforeEach(() => {
      cy.get('[data-testid="case-row"]').first().click();
    });

    it('should add comments', () => {
      cy.get('[data-testid="comments-tab"]').click();
      cy.get('[data-testid="comment-input"]').type('This case requires immediate attention');
      cy.get('[data-testid="add-comment-button"]').click();
      
      cy.wait('@addComment');
      cy.get('[data-testid="comment-list"]').should('contain', 'This case requires immediate attention');
    });

    it('should assign case to another user', () => {
      cy.get('[data-testid="assign-button"]').click();
      selectFromDropdown('assignee-select', 'jane.doe@example.com');
      cy.get('[data-testid="confirm-assign"]').click();
      
      cy.wait('@updateCase');
      checkNotification('Case assigned successfully', 'success');
    });
  });
});