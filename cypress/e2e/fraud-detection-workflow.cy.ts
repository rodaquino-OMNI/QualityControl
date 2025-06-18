import { waitForPageLoad, selectFromDropdown, checkNotification } from '../support/commands';

describe('Fraud Detection and Alert Workflow', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
    waitForPageLoad();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Real-Time Fraud Detection', () => {
    it('should detect duplicate claims in real time', () => {
      cy.visit('/fraud-detection');
      
      // Monitor real-time alerts
      cy.get('[data-testid="real-time-alerts"]').should('be.visible');
      
      // Simulate duplicate claim submission
      cy.task('queryDatabase', {
        sql: 'INSERT INTO claims (patient_id, procedure_code, claim_date, amount) VALUES ($1, $2, $3, $4)',
        params: ['PT-001', '33518', '2024-07-15', 125000]
      });

      // Wait for duplicate detection
      cy.wait(2000);
      
      // Check for duplicate alert
      cy.get('[data-testid="fraud-alert-duplicate"]').should('be.visible');
      cy.get('[data-testid="alert-severity-high"]').should('be.visible');
      cy.get('[data-testid="alert-message"]').should('contain', 'Duplicate claim detected');
    });

    it('should identify unusual billing patterns', () => {
      cy.visit('/fraud-detection/patterns');
      
      // Set up pattern detection
      cy.get('[data-testid="pattern-analysis-button"]').click();
      cy.get('[data-testid="analysis-period"]').select('last-30-days');
      cy.get('[data-testid="start-pattern-analysis"]').click();
      
      cy.wait('@analyzePatterns');
      
      // Check for pattern anomalies
      cy.get('[data-testid="unusual-patterns-section"]').should('be.visible');
      cy.get('[data-testid="pattern-outlier-provider"]').should('be.visible');
      cy.get('[data-testid="billing-frequency-anomaly"]').should('be.visible');
      
      // Verify pattern details
      cy.get('[data-testid="pattern-outlier-provider"]').click();
      cy.get('[data-testid="pattern-details-modal"]').should('be.visible');
      cy.get('[data-testid="provider-billing-history"]').should('be.visible');
      cy.get('[data-testid="anomaly-score"]').should('be.visible');
    });

    it('should flag high-cost claims for review', () => {
      cy.visit('/cases');
      
      // Create high-cost claim
      cy.get('[data-testid="create-case-button"]').click();
      cy.get('[data-testid="title-input"]').type('High-Cost Cardiac Surgery');
      cy.get('[data-testid="patient-id-input"]').type('PT-HIGHCOST-001');
      cy.get('[data-testid="claim-amount-input"]').type('450000'); // Above threshold
      cy.get('[data-testid="procedure-code-input"]').type('33518');
      
      cy.get('[data-testid="submit-button"]').click();
      cy.wait('@createCase');
      
      // Verify automatic fraud flag
      cy.get('[data-testid="case-row"]').first().should('contain', 'High-Cost Cardiac Surgery');
      cy.get('[data-testid="fraud-flag-high-cost"]').should('be.visible');
      cy.get('[data-testid="auto-review-required"]').should('be.visible');
    });

    it('should detect provider outlier behavior', () => {
      cy.visit('/fraud-detection/providers');
      
      cy.get('[data-testid="provider-search"]').type('PRV-OUTLIER-001');
      cy.get('[data-testid="search-button"]').click();
      cy.wait('@searchProvider');
      
      // Check provider risk assessment
      cy.get('[data-testid="provider-risk-score"]').should('be.visible');
      cy.get('[data-testid="risk-level-high"]').should('be.visible');
      
      // Review outlier indicators
      cy.get('[data-testid="outlier-indicators"]').should('be.visible');
      cy.get('[data-testid="indicator-unusual-volume"]').should('be.visible');
      cy.get('[data-testid="indicator-billing-patterns"]').should('be.visible');
      cy.get('[data-testid="indicator-peer-comparison"]').should('be.visible');
      
      // Generate provider investigation report
      cy.get('[data-testid="generate-investigation-report"]').click();
      cy.wait('@generateInvestigationReport');
      
      checkNotification('Investigation report generated', 'success');
    });
  });

  describe('Machine Learning Fraud Detection', () => {
    it('should run ML fraud prediction models', () => {
      cy.visit('/fraud-detection/ml-analysis');
      
      // Configure ML analysis
      cy.get('[data-testid="ml-model-selection"]').click();
      selectFromDropdown('ml-model', 'xgboost-fraud-v2');
      
      cy.get('[data-testid="prediction-threshold"]').clear().type('0.75');
      cy.get('[data-testid="include-ensemble"]').check();
      
      // Start ML analysis
      cy.get('[data-testid="run-ml-analysis"]').click();
      cy.wait('@runMLAnalysis');
      
      // Review ML predictions
      cy.get('[data-testid="ml-results-section"]').should('be.visible');
      cy.get('[data-testid="fraud-probability-score"]').should('be.visible');
      cy.get('[data-testid="feature-importance"]').should('be.visible');
      cy.get('[data-testid="model-explanation"]').should('be.visible');
      
      // Check high-risk predictions
      cy.get('[data-testid="high-risk-cases"]').should('be.visible');
      cy.get('[data-testid="case-fraud-score"]').should('contain', '%');
    });

    it('should provide model interpretation and explanations', () => {
      cy.visit('/fraud-detection/ml-analysis');
      cy.get('[data-testid="run-ml-analysis"]').click();
      cy.wait('@runMLAnalysis');
      
      // Access model explanation
      cy.get('[data-testid="explain-prediction-button"]').first().click();
      cy.get('[data-testid="explanation-modal"]').should('be.visible');
      
      // Check SHAP values
      cy.get('[data-testid="shap-values-chart"]').should('be.visible');
      cy.get('[data-testid="feature-contributions"]').should('be.visible');
      
      // Verify explanation quality
      cy.get('[data-testid="explanation-confidence"]').should('be.visible');
      cy.get('[data-testid="local-explanation"]').should('be.visible');
      cy.get('[data-testid="global-explanation"]').should('be.visible');
    });

    it('should handle model performance monitoring', () => {
      cy.visit('/fraud-detection/model-performance');
      
      // Check model metrics
      cy.get('[data-testid="model-accuracy"]').should('be.visible');
      cy.get('[data-testid="precision-score"]').should('be.visible');
      cy.get('[data-testid="recall-score"]').should('be.visible');
      cy.get('[data-testid="f1-score"]').should('be.visible');
      
      // ROC curve and performance visualization
      cy.get('[data-testid="roc-curve-chart"]').should('be.visible');
      cy.get('[data-testid="confusion-matrix"]').should('be.visible');
      
      // Model drift detection
      cy.get('[data-testid="drift-detection-section"]').should('be.visible');
      cy.get('[data-testid="data-drift-score"]').should('be.visible');
      cy.get('[data-testid="concept-drift-alert"]').should('be.visible');
    });
  });

  describe('Fraud Investigation Workflow', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'Suspected Fraud Case',
        status: 'fraud_investigation',
        priority: 'urgent',
        patientId: 'PT-FRAUD-001',
        fraudScore: 0.89,
        flags: ['duplicate_claim', 'unusual_pattern', 'high_cost'],
      }).as('fraudCase');
    });

    it('should initiate comprehensive fraud investigation', () => {
      cy.visit('/fraud-investigations');
      
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="start-investigation-button"]').click();
      
      cy.get('[data-testid="investigation-modal"]').should('be.visible');
      
      // Set investigation parameters
      selectFromDropdown('investigation-type', 'comprehensive');
      selectFromDropdown('lead-investigator', Cypress.env('testUsers').manager.email);
      cy.get('[data-testid="investigation-priority"]').select('high');
      
      // Define investigation scope
      cy.get('[data-testid="scope-provider-history"]').check();
      cy.get('[data-testid="scope-patient-records"]').check();
      cy.get('[data-testid="scope-billing-patterns"]').check();
      cy.get('[data-testid="scope-peer-comparison"]').check();
      
      cy.get('[data-testid="start-investigation"]').click();
      cy.wait('@startInvestigation');
      
      checkNotification('Fraud investigation initiated', 'success');
      cy.get('[data-testid="investigation-status"]').should('contain', 'Active');
    });

    it('should gather and analyze evidence', () => {
      cy.visit('/fraud-investigations');
      cy.get('[data-testid="case-row"]').first().click();
      
      cy.get('[data-testid="evidence-tab"]').click();
      
      // Add evidence items
      cy.get('[data-testid="add-evidence-button"]').click();
      cy.get('[data-testid="evidence-type"]').select('billing-records');
      cy.get('[data-testid="evidence-description"]').type('Duplicate billing for same procedure on same date');
      cy.get('[data-testid="evidence-severity"]').select('high');
      
      // Upload supporting documents
      cy.fixture('billing-records.pdf', 'base64').then(fileContent => {
        cy.get('[data-testid="evidence-file-upload"]').attachFile({
          fileContent,
          fileName: 'billing-records.pdf',
          mimeType: 'application/pdf',
          encoding: 'base64',
        });
      });
      
      cy.get('[data-testid="save-evidence"]').click();
      cy.wait('@saveEvidence');
      
      // Verify evidence chain
      cy.get('[data-testid="evidence-list"]').should('contain', 'Duplicate billing for same procedure');
      cy.get('[data-testid="evidence-severity-high"]').should('be.visible');
      cy.get('[data-testid="evidence-timestamp"]').should('be.visible');
    });

    it('should perform cross-referencing and data analysis', () => {
      cy.visit('/fraud-investigations');
      cy.get('[data-testid="case-row"]').first().click();
      
      cy.get('[data-testid="analysis-tab"]').click();
      
      // Cross-reference with databases
      cy.get('[data-testid="cross-reference-button"]').click();
      cy.get('[data-testid="reference-npdb"]').check(); // National Practitioner Data Bank
      cy.get('[data-testid="reference-oig"]').check(); // Office of Inspector General
      cy.get('[data-testid="reference-internal-db"]').check();
      
      cy.get('[data-testid="run-cross-reference"]').click();
      cy.wait('@crossReference');
      
      // Review cross-reference results
      cy.get('[data-testid="cross-ref-results"]').should('be.visible');
      cy.get('[data-testid="matches-found"]').should('be.visible');
      cy.get('[data-testid="red-flags-section"]').should('be.visible');
      
      // Financial analysis
      cy.get('[data-testid="financial-analysis-button"]').click();
      cy.wait('@financialAnalysis');
      
      cy.get('[data-testid="financial-impact"]').should('be.visible');
      cy.get('[data-testid="recovery-potential"]').should('be.visible');
    });

    it('should collaborate with external agencies', () => {
      cy.visit('/fraud-investigations');
      cy.get('[data-testid="case-row"]').first().click();
      
      cy.get('[data-testid="collaboration-tab"]').click();
      
      // Notify regulatory agencies
      cy.get('[data-testid="notify-agencies-button"]').click();
      cy.get('[data-testid="agency-cms"]').check();
      cy.get('[data-testid="agency-state-medicaid"]').check();
      
      cy.get('[data-testid="notification-urgency"]').select('high');
      cy.get('[data-testid="notification-summary"]').type('Suspected provider fraud - duplicate billing pattern identified');
      
      cy.get('[data-testid="send-notifications"]').click();
      cy.wait('@notifyAgencies');
      
      checkNotification('Regulatory agencies notified', 'success');
      
      // Track communication
      cy.get('[data-testid="communication-log"]').should('be.visible');
      cy.get('[data-testid="agency-response-tracker"]').should('be.visible');
    });
  });

  describe('Fraud Prevention and Monitoring', () => {
    it('should set up fraud prevention rules', () => {
      cy.visit('/fraud-detection/prevention-rules');
      
      // Create new prevention rule
      cy.get('[data-testid="create-rule-button"]').click();
      cy.get('[data-testid="rule-modal"]').should('be.visible');
      
      cy.get('[data-testid="rule-name"]').type('High Volume Same Day Procedures');
      cy.get('[data-testid="rule-description"]').type('Flag providers billing more than 10 of the same procedure on one day');
      
      // Define rule conditions
      cy.get('[data-testid="condition-procedure-count"]').type('10');
      cy.get('[data-testid="condition-time-period"]').select('same-day');
      cy.get('[data-testid="condition-same-provider"]').check();
      
      // Set actions
      cy.get('[data-testid="action-flag-for-review"]').check();
      cy.get('[data-testid="action-auto-deny"]').uncheck();
      cy.get('[data-testid="action-notify-manager"]').check();
      
      cy.get('[data-testid="save-rule"]').click();
      cy.wait('@savePreventionRule');
      
      checkNotification('Prevention rule created', 'success');
    });

    it('should monitor fraud prevention effectiveness', () => {
      cy.visit('/fraud-detection/prevention-dashboard');
      
      // Check prevention metrics
      cy.get('[data-testid="prevented-fraud-amount"]').should('be.visible');
      cy.get('[data-testid="prevention-rate"]').should('be.visible');
      cy.get('[data-testid="false-positive-rate"]').should('be.visible');
      
      // Rule effectiveness analysis
      cy.get('[data-testid="rule-effectiveness-chart"]').should('be.visible');
      cy.get('[data-testid="top-performing-rules"]').should('be.visible');
      cy.get('[data-testid="rules-needing-adjustment"]').should('be.visible');
      
      // Trend analysis
      cy.get('[data-testid="fraud-trends-chart"]').should('be.visible');
      cy.get('[data-testid="seasonal-patterns"]').should('be.visible');
    });

    it('should handle whitelist and blacklist management', () => {
      cy.visit('/fraud-detection/lists-management');
      
      // Provider whitelist management
      cy.get('[data-testid="whitelist-tab"]').click();
      cy.get('[data-testid="add-to-whitelist-button"]').click();
      
      cy.get('[data-testid="provider-id-input"]').type('PRV-TRUSTED-001');
      cy.get('[data-testid="whitelist-reason"]').type('High-performing provider with excellent audit history');
      cy.get('[data-testid="whitelist-expiry"]').type('2025-07-15');
      
      cy.get('[data-testid="add-to-whitelist"]').click();
      cy.wait('@addToWhitelist');
      
      // Provider blacklist management
      cy.get('[data-testid="blacklist-tab"]').click();
      cy.get('[data-testid="add-to-blacklist-button"]').click();
      
      cy.get('[data-testid="provider-id-input"]').type('PRV-SUSPENDED-001');
      cy.get('[data-testid="blacklist-reason"]').type('Multiple fraud violations - suspended from program');
      cy.get('[data-testid="severity-level"]').select('high');
      
      cy.get('[data-testid="add-to-blacklist"]').click();
      cy.wait('@addToBlacklist');
      
      checkNotification('Provider added to blacklist', 'success');
    });
  });

  describe('Fraud Reporting and Analytics', () => {
    it('should generate comprehensive fraud reports', () => {
      cy.visit('/fraud-detection/reporting');
      
      cy.get('[data-testid="generate-report-button"]').click();
      cy.get('[data-testid="report-modal"]').should('be.visible');
      
      // Select report parameters
      selectFromDropdown('report-type', 'comprehensive-fraud');
      cy.get('[data-testid="date-range-start"]').type('2024-01-01');
      cy.get('[data-testid="date-range-end"]').type('2024-07-15');
      
      // Report sections
      cy.get('[data-testid="include-fraud-statistics"]').check();
      cy.get('[data-testid="include-case-summaries"]').check();
      cy.get('[data-testid="include-financial-impact"]').check();
      cy.get('[data-testid="include-prevention-metrics"]').check();
      
      cy.get('[data-testid="generate-report"]').click();
      cy.wait('@generateFraudReport');
      
      // Verify report generation
      checkNotification('Fraud report generated successfully', 'success');
      cy.get('[data-testid="download-report"]').should('be.visible');
      cy.get('[data-testid="share-report"]').should('be.visible');
    });

    it('should provide fraud analytics dashboard', () => {
      cy.visit('/fraud-detection/analytics');
      
      // Key performance indicators
      cy.get('[data-testid="fraud-detection-kpis"]').should('be.visible');
      cy.get('[data-testid="total-fraud-detected"]').should('be.visible');
      cy.get('[data-testid="fraud-recovery-amount"]').should('be.visible');
      cy.get('[data-testid="average-investigation-time"]').should('be.visible');
      
      // Interactive charts
      cy.get('[data-testid="fraud-by-category-chart"]').should('be.visible');
      cy.get('[data-testid="monthly-fraud-trend"]').should('be.visible');
      cy.get('[data-testid="provider-risk-distribution"]').should('be.visible');
      
      // Drill-down capabilities
      cy.get('[data-testid="fraud-by-category-chart"]').click();
      cy.get('[data-testid="category-detail-modal"]').should('be.visible');
      cy.get('[data-testid="detailed-breakdown"]').should('be.visible');
    });

    it('should support regulatory compliance reporting', () => {
      cy.visit('/fraud-detection/compliance-reporting');
      
      // Regulatory report templates
      cy.get('[data-testid="cms-report-template"]').should('be.visible');
      cy.get('[data-testid="oig-report-template"]').should('be.visible');
      cy.get('[data-testid="state-report-template"]').should('be.visible');
      
      // Generate CMS compliance report
      cy.get('[data-testid="generate-cms-report"]').click();
      cy.get('[data-testid="compliance-period"]').select('quarterly');
      cy.get('[data-testid="include-sanctions"]').check();
      cy.get('[data-testid="include-recoveries"]').check();
      
      cy.get('[data-testid="generate-compliance-report"]').click();
      cy.wait('@generateComplianceReport');
      
      // Validate compliance data
      cy.get('[data-testid="compliance-validation"]').should('be.visible');
      cy.get('[data-testid="validation-status-passed"]').should('be.visible');
      
      checkNotification('Compliance report ready for submission', 'success');
    });
  });

  describe('Fraud Alert Management', () => {
    it('should manage fraud alert lifecycle', () => {
      cy.visit('/fraud-detection/alerts');
      
      // View active alerts
      cy.get('[data-testid="active-alerts-list"]').should('be.visible');
      cy.get('[data-testid="alert-high-priority"]').should('be.visible');
      
      // Process an alert
      cy.get('[data-testid="alert-row"]').first().click();
      cy.get('[data-testid="alert-details-modal"]').should('be.visible');
      
      // Review alert details
      cy.get('[data-testid="alert-summary"]').should('be.visible');
      cy.get('[data-testid="alert-evidence"]').should('be.visible');
      cy.get('[data-testid="recommended-actions"]').should('be.visible');
      
      // Take action on alert
      selectFromDropdown('alert-action', 'investigate');
      cy.get('[data-testid="action-notes"]').type('Initiating full investigation based on suspicious billing pattern');
      cy.get('[data-testid="assign-investigator"]').select(Cypress.env('testUsers').manager.email);
      
      cy.get('[data-testid="process-alert"]').click();
      cy.wait('@processAlert');
      
      checkNotification('Alert processed - investigation assigned', 'success');
    });

    it('should configure alert thresholds and rules', () => {
      cy.visit('/fraud-detection/alert-configuration');
      
      // Configure threshold settings
      cy.get('[data-testid="fraud-score-threshold"]').clear().type('0.8');
      cy.get('[data-testid="high-cost-threshold"]').clear().type('100000');
      cy.get('[data-testid="duplicate-time-window"]').clear().type('24');
      
      // Alert frequency settings
      cy.get('[data-testid="immediate-alerts"]').check();
      cy.get('[data-testid="daily-digest"]').check();
      cy.get('[data-testid="weekly-summary"]').uncheck();
      
      // Notification preferences
      cy.get('[data-testid="email-notifications"]').check();
      cy.get('[data-testid="sms-notifications"]').uncheck();
      cy.get('[data-testid="dashboard-notifications"]').check();
      
      cy.get('[data-testid="save-alert-config"]').click();
      cy.wait('@saveAlertConfig');
      
      checkNotification('Alert configuration updated', 'success');
    });
  });
});