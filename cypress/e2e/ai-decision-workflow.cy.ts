import { waitForPageLoad, selectFromDropdown, checkNotification } from '../support/commands';

describe('AI-Assisted Decision Making Workflow', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').auditor.email, Cypress.env('testUsers').auditor.password);
    cy.visit('/cases');
    waitForPageLoad();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('AI Analysis Initiation', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'AI Analysis Test Case',
        status: 'pending_review',
        priority: 'high',
        patientId: 'PT-AI-001',
        procedureCode: '33518',
        diagnosisCode: 'I25.10',
      }).as('testCase');
    });

    it('should trigger comprehensive AI analysis', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-analysis-tab"]').click();

      cy.get('[data-testid="start-ai-analysis"]').click();
      cy.get('[data-testid="ai-analysis-modal"]').should('be.visible');

      // Select analysis types
      cy.get('[data-testid="analysis-medical-necessity"]').check();
      cy.get('[data-testid="analysis-fraud-detection"]').check();
      cy.get('[data-testid="analysis-cost-effectiveness"]').check();
      cy.get('[data-testid="analysis-clinical-guidelines"]').check();

      // Set analysis parameters
      selectFromDropdown('ai-model-selection', 'bert-medical-v2');
      cy.get('[data-testid="confidence-threshold"]').clear().type('0.8');
      cy.get('[data-testid="include-literature-review"]').check();

      cy.get('[data-testid="start-analysis"]').click();
      cy.wait('@startAIAnalysis');

      // Verify analysis started
      checkNotification('AI analysis initiated', 'success');
      cy.get('[data-testid="analysis-status"]').should('contain', 'In Progress');
      cy.get('[data-testid="analysis-progress-bar"]').should('be.visible');
    });

    it('should show real-time analysis progress', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-analysis-tab"]').click();
      cy.get('[data-testid="start-ai-analysis"]').click();
      cy.get('[data-testid="start-analysis"]').click();

      // Monitor progress stages
      cy.get('[data-testid="progress-stage-data-extraction"]').should('contain', 'Completed');
      cy.get('[data-testid="progress-stage-medical-coding"]').should('contain', 'In Progress');

      // Wait for analysis completion
      cy.get('[data-testid="analysis-status"]', { timeout: 30000 }).should('contain', 'Completed');
      cy.get('[data-testid="view-results-button"]').should('be.visible');
    });

    it('should handle analysis errors gracefully', () => {
      cy.intercept('POST', '**/api/ai/analyze/**', { statusCode: 500 }).as('failedAnalysis');

      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-analysis-tab"]').click();
      cy.get('[data-testid="start-ai-analysis"]').click();
      cy.get('[data-testid="start-analysis"]').click();

      cy.wait('@failedAnalysis');

      checkNotification('AI analysis failed', 'error');
      cy.get('[data-testid="retry-analysis-button"]').should('be.visible');
      cy.get('[data-testid="contact-support-button"]').should('be.visible');
    });
  });

  describe('AI Results Interpretation', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'AI Results Test Case',
        status: 'ai_analysis_complete',
        priority: 'high',
        patientId: 'PT-AI-RESULTS-001',
      }).as('testCase');
    });

    it('should display comprehensive AI analysis results', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-results-tab"]').click();

      // Verify all analysis sections are present
      cy.get('[data-testid="medical-necessity-results"]').should('be.visible');
      cy.get('[data-testid="fraud-risk-results"]').should('be.visible');
      cy.get('[data-testid="cost-analysis-results"]').should('be.visible');
      cy.get('[data-testid="guidelines-compliance-results"]').should('be.visible');

      // Check medical necessity analysis
      cy.get('[data-testid="medical-necessity-score"]').should('contain', '92%');
      cy.get('[data-testid="medical-necessity-confidence"]').should('contain', 'High');
      cy.get('[data-testid="medical-necessity-rationale"]').should('be.visible');

      // Check fraud risk assessment
      cy.get('[data-testid="fraud-risk-score"]').should('contain', 'Low');
      cy.get('[data-testid="fraud-indicators"]').should('be.visible');

      // Verify interactive elements
      cy.get('[data-testid="expand-rationale-button"]').click();
      cy.get('[data-testid="detailed-rationale"]').should('be.visible');
    });

    it('should show AI model confidence and methodology', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-results-tab"]').click();

      cy.get('[data-testid="model-details-button"]').click();
      cy.get('[data-testid="model-info-modal"]').should('be.visible');

      // Verify model information
      cy.get('[data-testid="model-name"]').should('contain', 'BERT Medical v2.1');
      cy.get('[data-testid="model-accuracy"]').should('contain', '94.2%');
      cy.get('[data-testid="training-data-info"]').should('be.visible');
      cy.get('[data-testid="last-updated"]').should('be.visible');

      // Check confidence intervals
      cy.get('[data-testid="confidence-interval"]').should('be.visible');
      cy.get('[data-testid="uncertainty-metrics"]').should('be.visible');
    });

    it('should provide literature and evidence references', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-results-tab"]').click();

      cy.get('[data-testid="evidence-references-section"]').should('be.visible');
      cy.get('[data-testid="clinical-guidelines-used"]').should('be.visible');

      // Check individual references
      cy.get('[data-testid="reference-0"]').should('contain', 'American Heart Association Guidelines');
      cy.get('[data-testid="reference-1"]').should('contain', 'Clinical Evidence Database');

      // Verify reference links
      cy.get('[data-testid="reference-link-0"]').should('have.attr', 'href');
      cy.get('[data-testid="view-full-bibliography"]').click();
      cy.get('[data-testid="bibliography-modal"]').should('be.visible');
    });

    it('should highlight critical findings and alerts', () => {
      cy.createCase({
        title: 'High Risk AI Case',
        status: 'ai_analysis_complete',
        priority: 'urgent',
        patientId: 'PT-AI-HIGHRISK-001',
        aiFlags: ['high_cost', 'potential_fraud', 'clinical_concern'],
      }).as('highRiskCase');

      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-results-tab"]').click();

      // Verify critical alerts
      cy.get('[data-testid="critical-alerts-section"]').should('be.visible');
      cy.get('[data-testid="alert-high-cost"]').should('be.visible');
      cy.get('[data-testid="alert-fraud-risk"]').should('be.visible');
      cy.get('[data-testid="alert-clinical-concern"]').should('be.visible');

      // Check alert details
      cy.get('[data-testid="alert-high-cost"]').click();
      cy.get('[data-testid="alert-details-modal"]').should('be.visible');
      cy.get('[data-testid="alert-explanation"]').should('be.visible');
      cy.get('[data-testid="recommended-actions"]').should('be.visible');
    });
  });

  describe('Human-AI Collaboration', () => {
    beforeEach(() => {
      cy.createCase({
        title: 'Human-AI Collaboration Case',
        status: 'ai_analysis_complete',
        priority: 'high',
        patientId: 'PT-HUMAN-AI-001',
      }).as('testCase');
    });

    it('should allow human review and AI recommendation comparison', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="human-ai-review-tab"]').click();

      // AI recommendation section
      cy.get('[data-testid="ai-recommendation"]').should('contain', 'Approve');
      cy.get('[data-testid="ai-confidence"]').should('contain', '87%');

      // Human reviewer section
      cy.get('[data-testid="human-reviewer-section"]').should('be.visible');
      cy.get('[data-testid="agree-with-ai"]').check();

      // Add human insights
      cy.get('[data-testid="human-insights"]').type('AI analysis is comprehensive and accurate. Clinical judgment aligns with AI recommendation.');

      // Override AI recommendation if needed
      cy.get('[data-testid="override-ai-button"]').should('be.visible');

      cy.get('[data-testid="submit-human-review"]').click();
      cy.wait('@submitHumanReview');

      checkNotification('Human review completed', 'success');
    });

    it('should handle AI recommendation override', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="human-ai-review-tab"]').click();

      // Override AI recommendation
      cy.get('[data-testid="override-ai-button"]').click();
      cy.get('[data-testid="override-modal"]').should('be.visible');

      selectFromDropdown('override-decision', 'deny');
      cy.get('[data-testid="override-rationale"]').type('While AI analysis suggests approval, recent clinical studies indicate higher risk than AI model accounts for.');

      // Additional review requirement
      cy.get('[data-testid="require-peer-review"]').check();
      selectFromDropdown('peer-reviewer', Cypress.env('testUsers').manager.email);

      cy.get('[data-testid="submit-override"]').click();
      cy.wait('@submitOverride');

      checkNotification('AI recommendation overridden - peer review requested', 'success');
      cy.get('[data-testid="override-status"]').should('contain', 'Human Override Applied');
    });

    it('should facilitate AI model feedback and learning', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-feedback-tab"]').click();

      // Provide feedback on AI accuracy
      cy.get('[data-testid="accuracy-rating"]').click();
      cy.get('[data-testid="rating-4-stars"]').click();

      // Specific feedback areas
      cy.get('[data-testid="medical-coding-feedback"]').type('AI correctly identified primary procedure but missed secondary diagnosis.');
      
      cy.get('[data-testid="literature-relevance-feedback"]').type('Literature references were highly relevant and current.');

      // Suggest improvements
      cy.get('[data-testid="improvement-suggestions"]').type('Consider incorporating more recent cardiovascular surgery outcome data.');

      cy.get('[data-testid="submit-feedback"]').click();
      cy.wait('@submitAIFeedback');

      checkNotification('AI feedback submitted for model improvement', 'success');
    });
  });

  describe('AI-Driven Risk Assessment', () => {
    it('should perform comprehensive risk stratification', () => {
      cy.createCase({
        title: 'Risk Assessment Case',
        status: 'pending_review',
        priority: 'high',
        patientId: 'PT-RISK-001',
        riskFactors: ['diabetes', 'hypertension', 'previous_surgery'],
      }).as('riskCase');

      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="risk-assessment-tab"]').click();

      cy.get('[data-testid="start-risk-analysis"]').click();
      cy.wait('@performRiskAnalysis');

      // Verify risk categories
      cy.get('[data-testid="clinical-risk-score"]').should('be.visible');
      cy.get('[data-testid="financial-risk-score"]').should('be.visible');
      cy.get('[data-testid="operational-risk-score"]').should('be.visible');

      // Check risk factors visualization
      cy.get('[data-testid="risk-factors-chart"]').should('be.visible');
      cy.get('[data-testid="risk-mitigation-recommendations"]').should('be.visible');

      // Interactive risk exploration
      cy.get('[data-testid="risk-factor-diabetes"]').click();
      cy.get('[data-testid="risk-detail-modal"]').should('be.visible');
      cy.get('[data-testid="risk-impact-score"]').should('be.visible');
    });

    it('should provide predictive analytics for case outcomes', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="predictive-analytics-tab"]').click();

      cy.get('[data-testid="generate-predictions"]').click();
      cy.wait('@generatePredictions');

      // Outcome predictions
      cy.get('[data-testid="approval-probability"]').should('contain', '%');
      cy.get('[data-testid="cost-prediction"]').should('be.visible');
      cy.get('[data-testid="timeline-prediction"]').should('be.visible');

      // Scenario analysis
      cy.get('[data-testid="scenario-analysis-button"]').click();
      cy.get('[data-testid="scenario-modal"]').should('be.visible');

      selectFromDropdown('scenario-type', 'what-if');
      cy.get('[data-testid="modify-parameter-age"]').clear().type('65');
      cy.get('[data-testid="run-scenario"]').click();

      cy.get('[data-testid="scenario-results"]').should('be.visible');
      cy.get('[data-testid="outcome-comparison"]').should('be.visible');
    });
  });

  describe('AI Model Performance Monitoring', () => {
    it('should display model performance metrics', () => {
      cy.visit('/ai/performance');
      waitForPageLoad();

      // Overall performance dashboard
      cy.get('[data-testid="model-performance-dashboard"]').should('be.visible');
      cy.get('[data-testid="accuracy-metric"]').should('be.visible');
      cy.get('[data-testid="precision-metric"]').should('be.visible');
      cy.get('[data-testid="recall-metric"]').should('be.visible');

      // Performance trends
      cy.get('[data-testid="performance-trend-chart"]').should('be.visible');
      cy.get('[data-testid="prediction-accuracy-over-time"]').should('be.visible');

      // Model comparison
      cy.get('[data-testid="model-comparison-section"]').should('be.visible');
      selectFromDropdown('compare-models', 'bert-vs-lstm');
      cy.get('[data-testid="comparison-chart"]').should('be.visible');
    });

    it('should show model drift detection', () => {
      cy.visit('/ai/performance');
      cy.get('[data-testid="model-drift-tab"]').click();

      // Drift detection metrics
      cy.get('[data-testid="data-drift-score"]').should('be.visible');
      cy.get('[data-testid="concept-drift-score"]').should('be.visible');

      // Drift alerts
      cy.get('[data-testid="drift-alerts"]').should('be.visible');
      cy.get('[data-testid="drift-threshold-settings"]').should('be.visible');

      // Retraining recommendations
      cy.get('[data-testid="retraining-recommendations"]').should('be.visible');
    });
  });

  describe('AI Audit Trail and Explainability', () => {
    it('should provide detailed decision audit trail', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-audit-trail-tab"]').click();

      // Decision path visualization
      cy.get('[data-testid="decision-tree-visualization"]').should('be.visible');
      cy.get('[data-testid="feature-importance-chart"]').should('be.visible');

      // Step-by-step reasoning
      cy.get('[data-testid="reasoning-step-1"]').should('be.visible');
      cy.get('[data-testid="reasoning-step-2"]').should('be.visible');

      // Data sources used
      cy.get('[data-testid="data-sources-section"]').should('be.visible');
      cy.get('[data-testid="input-features-list"]').should('be.visible');

      // Explainability metrics
      cy.get('[data-testid="explanation-confidence"]').should('be.visible');
      cy.get('[data-testid="feature-contributions"]').should('be.visible');
    });

    it('should generate AI decision reports', () => {
      cy.get('[data-testid="case-row"]').first().click();
      cy.get('[data-testid="ai-audit-trail-tab"]').click();

      cy.get('[data-testid="generate-ai-report"]').click();
      cy.get('[data-testid="report-options-modal"]').should('be.visible');

      // Select report components
      cy.get('[data-testid="include-decision-path"]').check();
      cy.get('[data-testid="include-confidence-scores"]').check();
      cy.get('[data-testid="include-literature-refs"]').check();
      cy.get('[data-testid="include-model-details"]').check();

      cy.get('[data-testid="generate-report"]').click();
      cy.wait('@generateAIReport');

      checkNotification('AI decision report generated', 'success');
      cy.get('[data-testid="download-report-button"]').should('be.visible');
    });
  });

  describe('AI Integration Quality Assurance', () => {
    it('should validate AI input data quality', () => {
      cy.visit('/ai/quality-assurance');
      waitForPageLoad();

      // Data quality dashboard
      cy.get('[data-testid="data-quality-dashboard"]').should('be.visible');
      cy.get('[data-testid="completeness-score"]').should('be.visible');
      cy.get('[data-testid="accuracy-score"]').should('be.visible');
      cy.get('[data-testid="consistency-score"]').should('be.visible');

      // Data validation results
      cy.get('[data-testid="validation-results-table"]').should('be.visible');
      cy.get('[data-testid="failed-validations"]').should('be.visible');

      // Quality improvement recommendations
      cy.get('[data-testid="quality-recommendations"]').should('be.visible');
    });

    it('should monitor AI system health', () => {
      cy.visit('/ai/system-health');
      waitForPageLoad();

      // System status indicators
      cy.get('[data-testid="ai-service-status"]').should('contain', 'Healthy');
      cy.get('[data-testid="model-loading-status"]').should('be.visible');
      cy.get('[data-testid="prediction-latency"]').should('be.visible');

      // Performance metrics
      cy.get('[data-testid="throughput-metric"]').should('be.visible');
      cy.get('[data-testid="error-rate-metric"]').should('be.visible');
      cy.get('[data-testid="resource-usage"]').should('be.visible');

      // Alert management
      cy.get('[data-testid="active-alerts"]').should('be.visible');
      cy.get('[data-testid="alert-thresholds"]').should('be.visible');
    });
  });
});