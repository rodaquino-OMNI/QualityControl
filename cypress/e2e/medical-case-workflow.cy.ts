import { waitForPageLoad, selectFromDropdown, checkNotification, fillForm } from '../support/commands';

describe('Medical Case Management Workflow', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
    cy.visit('/cases');
    waitForPageLoad();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Case Creation Workflow', () => {
    it('should create a comprehensive medical case', () => {
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="create-case-modal"]').should('be.visible');

      const caseData = {
        title: 'Cardiac Surgery Pre-Authorization Review',
        description: 'Patient requires cardiac bypass surgery pre-authorization review',
        priority: 'high',
        'patient-id': 'PT-2024-001',
        'medical-record': 'MRN-789012',
        'provider-id': 'PRV-12345',
        'procedure-code': '33518',
        'diagnosis-code': 'I25.10',
        'claim-amount': '125000',
        'service-date': '2024-07-15',
      };

      fillForm(caseData);

      // Add multiple diagnosis codes
      cy.get('[data-testid="add-diagnosis-button"]').click();
      cy.get('[data-testid="diagnosis-code-1"]').type('Z95.1');

      // Add procedure details
      cy.get('[data-testid="add-procedure-button"]').click();
      cy.get('[data-testid="procedure-description-0"]').type('Coronary artery bypass, using venous graft');

      // Set urgency level
      selectFromDropdown('urgency-level', 'immediate');

      // Add clinical indicators
      cy.get('[data-testid="clinical-indicators"]').type('Patient experiencing chest pain, positive stress test');

      cy.get('[data-testid="submit-button"]').click();
      cy.wait('@createCase');

      checkNotification('Medical case created successfully', 'success');
      cy.get('[data-testid="create-case-modal"]').should('not.exist');

      // Verify case appears in list with correct status
      cy.get('[data-testid="case-row"]').first().should('contain', 'Cardiac Surgery Pre-Authorization Review');
      cy.get('[data-testid="case-status"]').first().should('contain', 'Pending Review');
    });

    it('should validate required medical fields', () => {
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="submit-button"]').click();

      // Check all required field validations
      cy.get('[data-testid="title-error"]').should('contain', 'Title is required');
      cy.get('[data-testid="patient-id-error"]').should('contain', 'Patient ID is required');
      cy.get('[data-testid="medical-record-error"]').should('contain', 'Medical record number is required');
      cy.get('[data-testid="procedure-code-error"]').should('contain', 'Procedure code is required');
      cy.get('[data-testid="diagnosis-code-error"]').should('contain', 'At least one diagnosis code is required');
    });

    it('should validate medical codes format', () => {
      cy.get('[data-testid="create-case-button"]').click();

      // Test invalid procedure code
      cy.get('[data-testid="procedure-code-input"]').type('INVALID');
      cy.get('[data-testid="procedure-code-input"]').blur();
      cy.get('[data-testid="procedure-code-error"]').should('contain', 'Invalid CPT code format');

      // Test invalid diagnosis code
      cy.get('[data-testid="diagnosis-code-0"]').type('INVALID');
      cy.get('[data-testid="diagnosis-code-0"]').blur();
      cy.get('[data-testid="diagnosis-code-error-0"]').should('contain', 'Invalid ICD-10 code format');
    });
  });

  describe('Case Review Workflow', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'Test Review Case',
        status: 'pending_review',
        priority: 'high',
        patientId: 'PT-REVIEW-001',
      }).as('testCase');
    });

    it('should start case review process', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.url().should('match', /\/cases\/\d+/);

      cy.get('[data-testid="start-review-button"]').click();
      cy.get('[data-testid="review-modal"]').should('be.visible');

      // Select review type
      selectFromDropdown('review-type', 'clinical');

      // Assign to reviewer
      selectFromDropdown('reviewer-select', Cypress.env('testUsers').reviewer.email);

      cy.get('[data-testid="start-review-confirm"]').click();
      cy.wait('@updateCase');

      checkNotification('Review started successfully', 'success');
      cy.get('[data-testid="case-status"]').should('contain', 'Under Review');
    });

    it('should conduct clinical review with checklist', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="review-tab"]').click();

      // Clinical review checklist
      cy.get('[data-testid="medical-necessity-check"]').check();
      cy.get('[data-testid="documentation-complete-check"]').check();
      cy.get('[data-testid="prior-authorization-check"]').check();
      cy.get('[data-testid="provider-eligibility-check"]').check();

      // Add clinical notes
      cy.get('[data-testid="clinical-notes"]').type('Patient meets medical necessity criteria. All documentation is complete and supports the requested procedure.');

      // Risk assessment
      selectFromDropdown('risk-level', 'moderate');
      cy.get('[data-testid="risk-justification"]').type('Standard surgical risk factors present, patient stable');

      cy.get('[data-testid="save-review-button"]').click();
      cy.wait('@saveReview');

      checkNotification('Review progress saved', 'success');
    });

    it('should handle medical literature review', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="literature-review-tab"]').click();

      cy.get('[data-testid="search-literature-button"]').click();
      cy.get('[data-testid="literature-search-modal"]').should('be.visible');

      cy.get('[data-testid="search-terms"]').type('cardiac bypass surgery outcomes');
      cy.get('[data-testid="search-literature"]').click();
      cy.wait('@searchLiterature');

      // Select relevant studies
      cy.get('[data-testid="literature-result-0"]').within(() => {
        cy.get('[data-testid="select-study"]').check();
      });

      cy.get('[data-testid="add-selected-studies"]').click();
      checkNotification('Literature references added', 'success');

      // Add literature notes
      cy.get('[data-testid="literature-notes"]').type('Current literature supports the proposed surgical intervention with positive outcomes.');
    });
  });

  describe('Case Decision Workflow', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'Test Decision Case',
        status: 'under_review',
        priority: 'high',
        patientId: 'PT-DECISION-001',
      }).as('testCase');
    });

    it('should approve case with conditions', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="decision-tab"]').click();

      // Make approval decision
      cy.get('[data-testid="decision-approve"]').click();
      cy.get('[data-testid="approval-type-conditional"]').check();

      // Add approval conditions
      cy.get('[data-testid="add-condition-button"]').click();
      cy.get('[data-testid="condition-0"]').type('Pre-operative cardiac evaluation required');

      cy.get('[data-testid="add-condition-button"]').click();
      cy.get('[data-testid="condition-1"]').type('Post-operative cardiac rehabilitation mandated');

      // Set approval duration
      cy.get('[data-testid="approval-duration"]').type('90');
      selectFromDropdown('duration-unit', 'days');

      // Add decision rationale
      cy.get('[data-testid="decision-rationale"]').type('Procedure is medically necessary. Patient meets all clinical criteria for cardiac bypass surgery.');

      cy.get('[data-testid="submit-decision"]').click();
      cy.wait('@submitDecision');

      checkNotification('Case approved with conditions', 'success');
      cy.get('[data-testid="case-status"]').should('contain', 'Approved');
    });

    it('should deny case with detailed justification', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="decision-tab"]').click();

      // Make denial decision
      cy.get('[data-testid="decision-deny"]').click();

      // Select denial reason
      selectFromDropdown('denial-reason', 'insufficient-documentation');

      // Add specific denial codes
      cy.get('[data-testid="add-denial-code-button"]').click();
      selectFromDropdown('denial-code-0', 'N-123');

      // Detailed justification
      cy.get('[data-testid="denial-justification"]').type('Insufficient clinical documentation to support medical necessity. Missing pre-operative cardiac catheterization report.');

      // Required additional information
      cy.get('[data-testid="required-info"]').type('1. Cardiac catheterization report\n2. Echocardiogram results\n3. Stress test results');

      // Appeal information
      cy.get('[data-testid="appeal-rights-check"]').check();
      cy.get('[data-testid="appeal-deadline"]').type('30');

      cy.get('[data-testid="submit-decision"]').click();
      cy.wait('@submitDecision');

      checkNotification('Case denied - appeal rights provided', 'success');
      cy.get('[data-testid="case-status"]').should('contain', 'Denied');
    });

    it('should request additional information', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="decision-tab"]').click();

      // Request more information
      cy.get('[data-testid="decision-request-info"]').click();

      // Select information type
      cy.get('[data-testid="info-type-clinical"]').check();
      cy.get('[data-testid="info-type-administrative"]').check();

      // Specific requests
      cy.get('[data-testid="requested-documents"]').type('1. Updated physician notes\n2. Lab results from last 30 days\n3. Imaging studies');

      // Set deadline
      cy.get('[data-testid="response-deadline"]').type('2024-07-20');

      // Contact information
      cy.get('[data-testid="contact-provider-check"]').check();

      cy.get('[data-testid="submit-info-request"]').click();
      cy.wait('@requestInfo');

      checkNotification('Additional information requested', 'success');
      cy.get('[data-testid="case-status"]').should('contain', 'Pending Information');
    });
  });

  describe('Case Appeal Workflow', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'Test Appeal Case',
        status: 'denied',
        priority: 'high',
        patientId: 'PT-APPEAL-001',
        canAppeal: true,
      }).as('testCase');
    });

    it('should file an appeal with new evidence', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="appeal-button"]').should('be.visible').click();

      cy.get('[data-testid="appeal-modal"]').should('be.visible');

      // Appeal type
      selectFromDropdown('appeal-type', 'clinical');

      // Grounds for appeal
      cy.get('[data-testid="appeal-grounds"]').type('New clinical evidence supports medical necessity. Additional cardiac studies demonstrate severe blockage requiring immediate intervention.');

      // Upload new documentation
      cy.get('[data-testid="appeal-documents-tab"]').click();
      cy.fixture('cardiac-catheterization.pdf', 'base64').then(fileContent => {
        cy.get('[data-testid="file-upload"]').attachFile({
          fileContent,
          fileName: 'cardiac-catheterization.pdf',
          mimeType: 'application/pdf',
          encoding: 'base64',
        });
      });

      cy.get('[data-testid="upload-button"]').click();
      cy.wait('@uploadFile');

      // Expert opinion
      cy.get('[data-testid="expert-opinion-tab"]').click();
      cy.get('[data-testid="expert-name"]').type('Dr. John Smith, MD');
      cy.get('[data-testid="expert-credentials"]').type('Board Certified Cardiologist, 20 years experience');
      cy.get('[data-testid="expert-opinion"]').type('Based on recent studies, patient requires immediate surgical intervention to prevent cardiac event.');

      cy.get('[data-testid="submit-appeal"]').click();
      cy.wait('@submitAppeal');

      checkNotification('Appeal submitted successfully', 'success');
      cy.get('[data-testid="case-status"]').should('contain', 'Under Appeal');
    });

    it('should review appeal with peer consultation', () => {
      // Login as different reviewer for appeal
      cy.logout();
      cy.login(Cypress.env('testUsers').manager.email, Cypress.env('testUsers').manager.password);
      cy.visit('/cases');

      cy.get('[data-testid="filter-status"]').click();
      cy.get('[data-testid="status-option-under_appeal"]').click();

      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="appeal-review-tab"]').click();

      // Request peer consultation
      cy.get('[data-testid="request-peer-consultation"]').click();
      selectFromDropdown('peer-consultant', 'dr.johnson@austa.com');
      cy.get('[data-testid="consultation-notes"]').type('Please review new cardiac studies and provide clinical opinion on medical necessity.');

      cy.get('[data-testid="send-consultation"]').click();
      cy.wait('@requestConsultation');

      checkNotification('Peer consultation requested', 'success');
    });

    it('should decide on appeal with detailed reasoning', () => {
      cy.logout();
      cy.login(Cypress.env('testUsers').manager.email, Cypress.env('testUsers').manager.password);
      cy.visit('/cases');

      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="appeal-decision-tab"]').click();

      // Review appeal materials
      cy.get('[data-testid="review-original-decision"]').should('be.visible');
      cy.get('[data-testid="review-appeal-documents"]').should('be.visible');

      // Make appeal decision
      cy.get('[data-testid="appeal-decision-overturn"]').click();

      // New decision details
      selectFromDropdown('new-decision', 'approve');
      cy.get('[data-testid="appeal-decision-rationale"]').type('Upon review of new cardiac catheterization results, the procedure is medically necessary. Original denial overturned.');

      // Effective date
      cy.get('[data-testid="effective-date"]').type('2024-07-15');

      cy.get('[data-testid="submit-appeal-decision"]').click();
      cy.wait('@submitAppealDecision');

      checkNotification('Appeal decision submitted', 'success');
      cy.get('[data-testid="case-status"]').should('contain', 'Approved');
    });
  });

  describe('Case Collaboration Features', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'Test Collaboration Case',
        status: 'under_review',
        priority: 'high',
        patientId: 'PT-COLLAB-001',
      }).as('testCase');
    });

    it('should add internal comments and notifications', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="comments-tab"]').click();

      // Add internal comment
      cy.get('[data-testid="comment-type-internal"]').check();
      cy.get('[data-testid="comment-input"]').type('Need additional review from cardiac specialist before making decision.');

      // Tag team members
      cy.get('[data-testid="tag-user-button"]').click();
      selectFromDropdown('tag-user-select', Cypress.env('testUsers').reviewer.email);

      cy.get('[data-testid="add-comment-button"]').click();
      cy.wait('@addComment');

      checkNotification('Comment added and notifications sent', 'success');

      // Verify comment appears
      cy.get('[data-testid="comment-list"]').should('contain', 'Need additional review from cardiac specialist');
      cy.get('[data-testid="comment-tagged-users"]').should('contain', Cypress.env('testUsers').reviewer.email);
    });

    it('should reassign case with handoff notes', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="reassign-button"]').click();

      cy.get('[data-testid="reassign-modal"]').should('be.visible');

      // Select new assignee
      selectFromDropdown('new-assignee', Cypress.env('testUsers').reviewer.email);

      // Handoff notes
      cy.get('[data-testid="handoff-notes"]').type('Reassigning to specialist for cardiac procedure review. All initial documentation has been reviewed and appears complete.');

      // Priority adjustment
      selectFromDropdown('new-priority', 'urgent');

      cy.get('[data-testid="confirm-reassign"]').click();
      cy.wait('@reassignCase');

      checkNotification('Case reassigned successfully', 'success');
      cy.get('[data-testid="assigned-to"]').should('contain', Cypress.env('testUsers').reviewer.email);
    });

    it('should create task reminders and follow-ups', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="tasks-tab"]').click();

      // Create follow-up task
      cy.get('[data-testid="create-task-button"]').click();
      
      cy.get('[data-testid="task-title"]').type('Follow up on additional documentation');
      cy.get('[data-testid="task-description"]').type('Contact provider to request missing cardiac catheterization report');
      
      selectFromDropdown('task-priority', 'high');
      cy.get('[data-testid="task-due-date"]').type('2024-07-18');
      
      // Assign task
      selectFromDropdown('task-assignee', Cypress.env('testUsers').auditor.email);

      cy.get('[data-testid="create-task"]').click();
      cy.wait('@createTask');

      checkNotification('Task created successfully', 'success');

      // Verify task appears in list
      cy.get('[data-testid="task-list"]').should('contain', 'Follow up on additional documentation');
    });
  });

  describe('Case Quality Assurance', () => {
    it('should perform quality audit on completed case', () => {
      cy.createCase({
        title: 'Test QA Case',
        status: 'completed',
        priority: 'high',
        patientId: 'PT-QA-001',
      }).as('testCase');

      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="qa-audit-button"]').click();

      cy.get('[data-testid="qa-modal"]').should('be.visible');

      // QA checklist
      cy.get('[data-testid="qa-documentation-complete"]').check();
      cy.get('[data-testid="qa-decision-justified"]').check();
      cy.get('[data-testid="qa-timeline-appropriate"]').check();
      cy.get('[data-testid="qa-communication-proper"]').check();

      // QA score
      selectFromDropdown('qa-score', 'excellent');

      // QA notes
      cy.get('[data-testid="qa-notes"]').type('Case handled according to all protocols. Documentation complete and decision well-justified.');

      cy.get('[data-testid="submit-qa-audit"]').click();
      cy.wait('@submitQA');

      checkNotification('Quality audit completed', 'success');
      cy.get('[data-testid="qa-status"]').should('contain', 'QA Passed');
    });
  });
});