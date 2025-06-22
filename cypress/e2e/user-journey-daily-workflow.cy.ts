import { waitForPageLoad, selectFromDropdown, checkNotification } from '../support/commands';

describe('Daily Audit Workflow Journey', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
    waitForPageLoad();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Complete Daily Workflow', () => {
    it('should complete a full daily audit workflow efficiently', () => {
      // Step 1: Start on dashboard and review daily summary
      cy.visit('/dashboard');
      cy.get('[data-testid="daily-summary"]').should('be.visible');
      cy.get('[data-testid="pending-cases-count"]').should('be.visible');
      cy.get('[data-testid="urgent-cases-alert"]').should('be.visible');

      // Check for high-priority cases notification
      cy.get('[data-testid="urgent-cases-alert"]').then(($alert) => {
        if ($alert.is(':visible')) {
          cy.get('[data-testid="view-urgent-cases"]').click();
          cy.url().should('include', '/cases?priority=high');
        }
      });

      // Step 2: Navigate to cases and apply daily workflow filters
      cy.visit('/cases');
      
      // Apply auditor's daily filters
      cy.get('[data-testid="filter-assigned-to-me"]').click();
      cy.get('[data-testid="filter-status-pending"]').click();
      cy.get('[data-testid="filter-priority-high"]').click();
      cy.get('[data-testid="apply-filters"]').click();
      cy.wait('@getCases');

      // Verify filtered results
      cy.get('[data-testid="case-row"]').should('have.length.greaterThan', 0);
      cy.get('[data-testid="case-priority"]').each(($el) => {
        cy.wrap($el).should('contain', 'High');
      });

      // Step 3: Select and process first high-priority case
      cy.get('[data-testid="case-row"]').first().click();
      cy.url().should('match', /\/cases\/\d+/);

      // Record start time for workflow tracking
      cy.get('[data-testid="start-review-timer"]').click();
      cy.get('[data-testid="review-timer"]').should('be.visible');

      // Step 4: Review case details and medical documentation
      cy.get('[data-testid="case-details-tab"]').click();
      cy.get('[data-testid="patient-info"]').should('be.visible');
      cy.get('[data-testid="medical-history"]').should('be.visible');
      cy.get('[data-testid="current-condition"]').should('be.visible');

      // Check required documentation
      cy.get('[data-testid="documents-tab"]').click();
      cy.get('[data-testid="document-checklist"]').within(() => {
        cy.get('[data-testid="medical-records"]').should('have.class', 'complete');
        cy.get('[data-testid="lab-results"]').should('have.class', 'complete');
        cy.get('[data-testid="imaging-studies"]').should('have.class', 'complete');
      });

      // Step 5: Perform AI-assisted analysis
      cy.get('[data-testid="ai-analysis-tab"]').click();
      cy.get('[data-testid="start-ai-analysis"]').click();
      cy.get('[data-testid="analysis-loading"]').should('be.visible');
      cy.wait('@performAIAnalysis', { timeout: 30000 });

      // Review AI analysis results
      cy.get('[data-testid="ai-risk-score"]').should('be.visible');
      cy.get('[data-testid="ai-recommendations"]').should('be.visible');
      cy.get('[data-testid="ai-evidence-summary"]').should('be.visible');

      // Accept or modify AI recommendations
      cy.get('[data-testid="ai-recommendation-1"]').within(() => {
        cy.get('[data-testid="accept-recommendation"]').click();
      });

      cy.get('[data-testid="ai-recommendation-2"]').within(() => {
        cy.get('[data-testid="modify-recommendation"]').click();
        cy.get('[data-testid="modification-reason"]').type('Requires additional consideration based on patient history');
        cy.get('[data-testid="save-modification"]').click();
      });

      // Step 6: Add audit notes and comments
      cy.get('[data-testid="notes-tab"]').click();
      cy.get('[data-testid="add-audit-note"]').click();

      const auditNote = 'Comprehensive review completed. Patient meets medical necessity criteria for requested procedure. AI analysis confirms low risk profile. All required documentation present and supports approval.';
      
      cy.get('[data-testid="note-content"]').type(auditNote);
      selectFromDropdown('note-category', 'clinical-review');
      cy.get('[data-testid="note-confidential"]').check();
      cy.get('[data-testid="save-note"]').click();
      cy.wait('@saveNote');

      checkNotification('Audit note saved successfully', 'success');

      // Step 7: Make approval decision
      cy.get('[data-testid="decision-tab"]').click();
      cy.get('[data-testid="decision-approve"]').click();

      // Provide approval details
      cy.get('[data-testid="approval-type-full"]').check();
      cy.get('[data-testid="approval-duration"]').type('90');
      selectFromDropdown('duration-unit', 'days');

      // Add decision rationale
      const decisionRationale = 'Based on comprehensive medical review and AI analysis, the requested procedure is medically necessary. Patient meets all clinical criteria and has appropriate documentation. No contraindications identified. Approval granted for 90 days.';
      
      cy.get('[data-testid="decision-rationale"]').type(decisionRationale);

      // Add any conditions if needed
      cy.get('[data-testid="add-condition-button"]').click();
      cy.get('[data-testid="condition-0"]').type('Post-procedure follow-up required within 30 days');

      // Submit decision
      cy.get('[data-testid="submit-decision"]').click();
      cy.wait('@submitDecision');

      checkNotification('Case approved successfully', 'success');

      // Verify case status updated
      cy.get('[data-testid="case-status"]').should('contain', 'Approved');
      cy.get('[data-testid="review-timer"]').should('contain', 'Completed');

      // Step 8: Generate audit report
      cy.get('[data-testid="generate-report"]').click();
      cy.get('[data-testid="report-modal"]').should('be.visible');

      selectFromDropdown('report-type', 'comprehensive');
      cy.get('[data-testid="include-ai-analysis"]').check();
      cy.get('[data-testid="include-documentation"]').check();
      cy.get('[data-testid="include-timeline"]').check();

      cy.get('[data-testid="generate-report-button"]').click();
      cy.wait('@generateReport');

      cy.get('[data-testid="report-preview"]').should('be.visible');
      cy.get('[data-testid="download-report"]').click();

      // Verify file download
      cy.verifyDownload('audit-report.pdf');

      // Step 9: Return to dashboard and update daily progress
      cy.visit('/dashboard');
      
      // Verify daily stats updated
      cy.get('[data-testid="cases-completed-today"]').should('contain', '1');
      cy.get('[data-testid="average-review-time"]').should('be.visible');
      cy.get('[data-testid="productivity-score"]').should('be.visible');

      // Check for next case recommendation
      cy.get('[data-testid="next-case-recommendation"]').should('be.visible');
      cy.get('[data-testid="suggested-next-case"]').click();

      // Should navigate to next priority case
      cy.url().should('match', /\/cases\/\d+/);
    });

    it('should handle bulk case processing efficiently', () => {
      cy.visit('/cases');

      // Select multiple cases for bulk processing
      cy.get('[data-testid="bulk-select-mode"]').click();
      cy.get('[data-testid="case-checkbox"]').first().check();
      cy.get('[data-testid="case-checkbox"]').eq(1).check();
      cy.get('[data-testid="case-checkbox"]').eq(2).check();

      // Verify bulk actions available
      cy.get('[data-testid="bulk-actions-bar"]').should('be.visible');
      cy.get('[data-testid="selected-count"]').should('contain', '3 cases selected');

      // Perform bulk status update
      cy.get('[data-testid="bulk-status-update"]').click();
      selectFromDropdown('bulk-status', 'in_progress');
      cy.get('[data-testid="bulk-update-reason"]').type('Starting batch review process');
      cy.get('[data-testid="apply-bulk-update"]').click();
      cy.wait('@bulkUpdateCases');

      checkNotification('3 cases updated successfully', 'success');

      // Verify all selected cases updated
      cy.get('[data-testid="case-status"]').each(($el, index) => {
        if (index < 3) {
          cy.wrap($el).should('contain', 'In Progress');
        }
      });
    });

    it('should track and display productivity metrics', () => {
      cy.visit('/dashboard');

      // Check daily productivity metrics
      cy.get('[data-testid="productivity-widget"]').should('be.visible');
      cy.get('[data-testid="cases-per-hour"]').should('be.visible');
      cy.get('[data-testid="average-decision-time"]').should('be.visible');
      cy.get('[data-testid="accuracy-score"]').should('be.visible');

      // View detailed productivity analytics
      cy.get('[data-testid="view-detailed-analytics"]').click();
      cy.url().should('include', '/analytics');

      // Verify productivity charts
      cy.get('[data-testid="productivity-chart"]').should('be.visible');
      cy.get('[data-testid="decision-trends"]').should('be.visible');
      cy.get('[data-testid="quality-metrics"]').should('be.visible');

      // Check time period filters
      selectFromDropdown('time-period', 'last-30-days');
      cy.wait('@getAnalytics');

      // Verify updated metrics
      cy.get('[data-testid="total-cases-processed"]').should('be.visible');
      cy.get('[data-testid="approval-rate"]').should('be.visible');
      cy.get('[data-testid="appeal-rate"]').should('be.visible');
    });
  });

  describe('Workflow Interruption and Recovery', () => {
    it('should handle network interruption gracefully', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      // Start working on a case
      cy.get('[data-testid="notes-tab"]').click();
      cy.get('[data-testid="add-audit-note"]').click();
      cy.get('[data-testid="note-content"]').type('Starting review process...');

      // Simulate network interruption
      cy.intercept('POST', '/api/cases/*/notes', { forceNetworkError: true }).as('networkError');
      cy.get('[data-testid="save-note"]').click();
      cy.wait('@networkError');

      // Should show offline indicator and save locally
      cy.get('[data-testid="offline-indicator"]').should('be.visible');
      cy.get('[data-testid="local-save-indicator"]').should('contain', 'Changes saved locally');

      // Restore network
      cy.intercept('POST', '/api/cases/*/notes', { fixture: 'note-response.json' }).as('saveNote');
      cy.get('[data-testid="retry-sync"]').click();
      cy.wait('@saveNote');

      // Should show successful sync
      cy.get('[data-testid="sync-success"]').should('be.visible');
      checkNotification('Changes synced successfully', 'success');
    });

    it('should save progress during session timeout', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      // Start working and add substantial content
      cy.get('[data-testid="notes-tab"]').click();
      cy.get('[data-testid="add-audit-note"]').click();
      
      const longNote = 'This is a comprehensive audit note with substantial content that should be preserved during session timeout. '.repeat(10);
      cy.get('[data-testid="note-content"]').type(longNote);

      // Simulate session timeout
      cy.window().then((win) => {
        win.localStorage.removeItem('authToken');
      });

      // Trigger save
      cy.get('[data-testid="save-note"]').click();

      // Should redirect to login but preserve work
      cy.url().should('include', '/login');
      cy.get('[data-testid="session-expired-notice"]').should('contain', 'Your work has been saved');

      // Login again
      cy.get('[data-testid="email-input"]').type(Cypress.env('testUsers').auditor.email);
      cy.get('[data-testid="password-input"]').type(Cypress.env('testUsers').auditor.password);
      cy.get('[data-testid="login-button"]').click();

      // Should restore to previous work
      cy.get('[data-testid="restore-work-modal"]').should('be.visible');
      cy.get('[data-testid="restore-work"]').click();

      // Verify content restored
      cy.get('[data-testid="note-content"]').should('contain', longNote.substring(0, 50));
    });
  });

  describe('Collaboration Features in Daily Workflow', () => {
    it('should handle real-time collaboration notifications', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      // Simulate another user working on the same case
      cy.task('simulateUserActivity', {
        caseId: 'current-case-id',
        userId: 'other-user-id',
        action: 'viewing',
      });

      // Should show collaboration indicator
      cy.get('[data-testid="collaboration-indicator"]').should('be.visible');
      cy.get('[data-testid="other-users-viewing"]').should('contain', '1 other user viewing');

      // Simulate comment from other user
      cy.task('simulateUserActivity', {
        caseId: 'current-case-id',
        userId: 'other-user-id',
        action: 'commented',
        data: { comment: 'Please review the latest lab results' },
      });

      // Should show real-time notification
      cy.get('[data-testid="realtime-notification"]').should('be.visible');
      cy.get('[data-testid="new-comment-indicator"]').should('be.visible');

      // View new comment
      cy.get('[data-testid="comments-tab"]').click();
      cy.get('[data-testid="comment-list"]').should('contain', 'Please review the latest lab results');
      cy.get('[data-testid="comment-timestamp"]').should('contain', 'just now');
    });

    it('should enable quick consultation workflow', () => {
      cy.visit('/cases');
      cy.get('[data-testid="case-row"]').first().click();

      // Request quick consultation
      cy.get('[data-testid="request-consultation"]').click();
      cy.get('[data-testid="consultation-modal"]').should('be.visible');

      selectFromDropdown('consultation-type', 'clinical');
      selectFromDropdown('urgency', 'urgent');
      cy.get('[data-testid="consultation-question"]').type('Need second opinion on treatment approach for this patient');

      // Select available specialist
      cy.get('[data-testid="available-specialists"]').should('be.visible');
      cy.get('[data-testid="specialist-online"]').first().click();

      cy.get('[data-testid="send-consultation"]').click();
      cy.wait('@sendConsultation');

      checkNotification('Consultation request sent', 'success');

      // Should show consultation pending status
      cy.get('[data-testid="consultation-status"]').should('contain', 'Pending response');

      // Simulate specialist response
      cy.task('simulateConsultationResponse', {
        caseId: 'current-case-id',
        response: 'Based on the presented information, I recommend proceeding with the proposed treatment plan.',
      });

      // Should show response notification
      cy.get('[data-testid="consultation-response"]').should('be.visible');
      cy.get('[data-testid="specialist-response"]').should('contain', 'I recommend proceeding');
    });
  });
});