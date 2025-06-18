import { waitForPageLoad, selectFromDropdown, checkNotification } from '../support/commands';

describe('Analytics Dashboard Interaction Tests', () => {
  beforeEach(() => {
    cy.seedDatabase();
    cy.login(Cypress.env('testUsers').manager.email, Cypress.env('testUsers').manager.password);
    cy.visit('/analytics');
    waitForPageLoad();
  });

  afterEach(() => {
    cy.cleanupDatabase();
  });

  describe('Dashboard Overview', () => {
    it('should display key performance indicators', () => {
      // Verify main KPI cards are visible
      cy.get('[data-testid="kpi-total-cases"]').should('be.visible');
      cy.get('[data-testid="kpi-approval-rate"]').should('be.visible');
      cy.get('[data-testid="kpi-avg-processing-time"]').should('be.visible');
      cy.get('[data-testid="kpi-cost-savings"]').should('be.visible');
      cy.get('[data-testid="kpi-fraud-detected"]').should('be.visible');

      // Check KPI values are populated
      cy.get('[data-testid="kpi-total-cases-value"]').should('not.be.empty');
      cy.get('[data-testid="kpi-approval-rate-value"]').should('contain', '%');
      cy.get('[data-testid="kpi-avg-processing-time-value"]').should('contain', 'days');

      // Verify trend indicators
      cy.get('[data-testid="trend-indicator"]').should('have.length.at.least', 4);
      cy.get('[data-testid="trend-up"]').should('exist');
      cy.get('[data-testid="trend-down"]').should('exist');
    });

    it('should show real-time metrics updates', () => {
      // Check initial values
      cy.get('[data-testid="kpi-total-cases-value"]').then(($el) => {
        const initialValue = $el.text();
        
        // Trigger real-time update
        cy.get('[data-testid="refresh-metrics"]').click();
        cy.wait('@refreshMetrics');
        
        // Verify values can change (or at least the timestamp updates)
        cy.get('[data-testid="last-updated-timestamp"]').should('be.visible');
        cy.get('[data-testid="auto-refresh-indicator"]').should('be.visible');
      });
    });

    it('should allow KPI customization', () => {
      cy.get('[data-testid="customize-dashboard"]').click();
      cy.get('[data-testid="dashboard-settings-modal"]').should('be.visible');

      // Customize visible KPIs
      cy.get('[data-testid="kpi-selector-total-cases"]').uncheck();
      cy.get('[data-testid="kpi-selector-ai-accuracy"]').check();
      cy.get('[data-testid="kpi-selector-user-satisfaction"]').check();

      // Save customization
      cy.get('[data-testid="save-dashboard-settings"]').click();
      cy.wait('@saveDashboardSettings');

      checkNotification('Dashboard customization saved', 'success');

      // Verify changes applied
      cy.get('[data-testid="kpi-total-cases"]').should('not.exist');
      cy.get('[data-testid="kpi-ai-accuracy"]').should('be.visible');
      cy.get('[data-testid="kpi-user-satisfaction"]').should('be.visible');
    });
  });

  describe('Interactive Charts and Visualizations', () => {
    it('should display case volume trends chart', () => {
      cy.get('[data-testid="case-volume-chart"]').should('be.visible');
      
      // Verify chart elements
      cy.get('[data-testid="chart-legend"]').should('be.visible');
      cy.get('[data-testid="chart-axes"]').should('be.visible');
      cy.get('[data-testid="chart-data-points"]').should('exist');

      // Test chart interactivity
      cy.get('[data-testid="chart-data-point"]').first().trigger('mouseover');
      cy.get('[data-testid="chart-tooltip"]').should('be.visible');
      cy.get('[data-testid="tooltip-date"]').should('be.visible');
      cy.get('[data-testid="tooltip-value"]').should('be.visible');

      // Test chart zoom functionality
      cy.get('[data-testid="chart-zoom-in"]').click();
      cy.get('[data-testid="chart-zoom-level"]').should('not.contain', '100%');
      
      cy.get('[data-testid="chart-reset-zoom"]').click();
      cy.get('[data-testid="chart-zoom-level"]').should('contain', '100%');
    });

    it('should show approval rate analytics', () => {
      cy.get('[data-testid="approval-rate-chart"]').should('be.visible');
      
      // Check different chart views
      cy.get('[data-testid="chart-view-monthly"]').click();
      cy.wait('@getMonthlyApprovalData');
      cy.get('[data-testid="chart-title"]').should('contain', 'Monthly');

      cy.get('[data-testid="chart-view-quarterly"]').click();
      cy.wait('@getQuarterlyApprovalData');
      cy.get('[data-testid="chart-title"]').should('contain', 'Quarterly');

      // Test drill-down functionality
      cy.get('[data-testid="chart-data-point"]').first().click();
      cy.get('[data-testid="drill-down-modal"]').should('be.visible');
      cy.get('[data-testid="detailed-breakdown"]').should('be.visible');
    });

    it('should display processing time distribution', () => {
      cy.get('[data-testid="processing-time-chart"]').should('be.visible');
      
      // Verify histogram bins
      cy.get('[data-testid="histogram-bins"]').should('have.length.at.least', 5);
      cy.get('[data-testid="bin-label"]').should('be.visible');
      cy.get('[data-testid="bin-count"]').should('be.visible');

      // Test statistical overlays
      cy.get('[data-testid="show-mean-line"]').check();
      cy.get('[data-testid="mean-line"]').should('be.visible');
      
      cy.get('[data-testid="show-percentiles"]').check();
      cy.get('[data-testid="percentile-lines"]').should('be.visible');
    });

    it('should show cost analysis visualizations', () => {
      cy.get('[data-testid="cost-analysis-section"]').scrollIntoView();
      cy.get('[data-testid="cost-breakdown-chart"]').should('be.visible');

      // Test pie chart interactions
      cy.get('[data-testid="pie-slice"]').first().click();
      cy.get('[data-testid="slice-details-panel"]').should('be.visible');
      cy.get('[data-testid="cost-category-details"]').should('be.visible');

      // Test cost trends
      cy.get('[data-testid="cost-trends-tab"]').click();
      cy.get('[data-testid="cost-trends-chart"]').should('be.visible');
      cy.get('[data-testid="savings-highlight"]').should('be.visible');
    });
  });

  describe('Filtering and Data Exploration', () => {
    it('should apply date range filters', () => {
      cy.get('[data-testid="date-filter"]').click();
      cy.get('[data-testid="date-picker-modal"]').should('be.visible');

      // Set custom date range
      cy.get('[data-testid="start-date"]').type('2024-01-01');
      cy.get('[data-testid="end-date"]').type('2024-06-30');
      cy.get('[data-testid="apply-date-filter"]').click();

      cy.wait('@applyDateFilter');

      // Verify filter applied
      cy.get('[data-testid="active-filter-date"]').should('be.visible');
      cy.get('[data-testid="filter-date-display"]').should('contain', '2024-01-01 to 2024-06-30');

      // Check that charts update with filtered data
      cy.get('[data-testid="chart-loading"]').should('not.exist');
      cy.get('[data-testid="filtered-data-indicator"]').should('be.visible');
    });

    it('should filter by case status', () => {
      cy.get('[data-testid="status-filter"]').click();
      cy.get('[data-testid="status-dropdown"]').should('be.visible');

      // Select multiple statuses
      cy.get('[data-testid="status-approved"]').check();
      cy.get('[data-testid="status-denied"]').check();
      cy.get('[data-testid="status-pending"]').uncheck();

      cy.get('[data-testid="apply-status-filter"]').click();
      cy.wait('@applyStatusFilter');

      // Verify filter chips
      cy.get('[data-testid="filter-chip-approved"]').should('be.visible');
      cy.get('[data-testid="filter-chip-denied"]').should('be.visible');
      cy.get('[data-testid="filter-chip-pending"]').should('not.exist');
    });

    it('should filter by provider and department', () => {
      cy.get('[data-testid="provider-filter"]').click();
      cy.get('[data-testid="provider-search"]').type('CardioVascular Associates');
      cy.get('[data-testid="provider-suggestion"]').first().click();

      cy.get('[data-testid="department-filter"]').click();
      selectFromDropdown('department-select', 'cardiology');

      cy.get('[data-testid="apply-filters"]').click();
      cy.wait('@applyProviderFilter');

      // Verify filtered results
      cy.get('[data-testid="active-filters-summary"]').should('contain', 'CardioVascular Associates');
      cy.get('[data-testid="active-filters-summary"]').should('contain', 'Cardiology');
    });

    it('should clear all filters', () => {
      // Apply multiple filters first
      cy.get('[data-testid="date-filter"]').click();
      cy.get('[data-testid="preset-last-month"]').click();
      
      cy.get('[data-testid="status-filter"]').click();
      cy.get('[data-testid="status-approved"]').check();
      cy.get('[data-testid="apply-status-filter"]').click();

      // Clear all filters
      cy.get('[data-testid="clear-all-filters"]').click();
      cy.get('[data-testid="confirm-clear-filters"]').click();

      cy.wait('@clearAllFilters');

      // Verify all filters cleared
      cy.get('[data-testid="active-filter"]').should('not.exist');
      cy.get('[data-testid="no-filters-message"]').should('be.visible');
    });
  });

  describe('Export and Reporting', () => {
    it('should export dashboard data to Excel', () => {
      cy.get('[data-testid="export-menu"]').click();
      cy.get('[data-testid="export-excel"]').click();

      cy.get('[data-testid="export-options-modal"]').should('be.visible');
      
      // Configure export options
      cy.get('[data-testid="include-charts"]').check();
      cy.get('[data-testid="include-raw-data"]').check();
      cy.get('[data-testid="include-filters"]').check();

      cy.get('[data-testid="start-export"]').click();
      cy.wait('@exportToExcel');

      checkNotification('Excel export completed', 'success');
      cy.get('[data-testid="download-export"]').should('be.visible');
    });

    it('should export dashboard as PDF report', () => {
      cy.get('[data-testid="export-menu"]').click();
      cy.get('[data-testid="export-pdf"]').click();

      cy.get('[data-testid="pdf-options-modal"]').should('be.visible');

      // Select report template
      selectFromDropdown('pdf-template', 'executive-summary');
      cy.get('[data-testid="include-executive-summary"]').check();
      cy.get('[data-testid="include-detailed-charts"]').check();

      cy.get('[data-testid="generate-pdf"]').click();
      cy.wait('@generatePDF');

      checkNotification('PDF report generated', 'success');
      cy.get('[data-testid="preview-pdf"]').should('be.visible');
      cy.get('[data-testid="download-pdf"]').should('be.visible');
    });

    it('should schedule automated reports', () => {
      cy.get('[data-testid="reports-menu"]').click();
      cy.get('[data-testid="schedule-report"]').click();

      cy.get('[data-testid="schedule-modal"]').should('be.visible');

      // Configure scheduled report
      cy.get('[data-testid="report-name"]').type('Weekly Analytics Summary');
      selectFromDropdown('report-frequency', 'weekly');
      selectFromDropdown('report-day', 'monday');
      cy.get('[data-testid="report-time"]').type('09:00');

      // Select recipients
      cy.get('[data-testid="add-recipient"]').click();
      cy.get('[data-testid="recipient-email"]').type('manager@austa.com');
      cy.get('[data-testid="add-recipient-button"]').click();

      // Report content
      cy.get('[data-testid="include-kpis"]').check();
      cy.get('[data-testid="include-trends"]').check();
      cy.get('[data-testid="include-alerts"]').check();

      cy.get('[data-testid="save-schedule"]').click();
      cy.wait('@saveReportSchedule');

      checkNotification('Report scheduled successfully', 'success');
    });
  });

  describe('Performance Metrics and Alerts', () => {
    it('should display auditor performance metrics', () => {
      cy.get('[data-testid="performance-tab"]').click();
      cy.get('[data-testid="auditor-performance-section"]').should('be.visible');

      // Individual auditor metrics
      cy.get('[data-testid="auditor-list"]').should('be.visible');
      cy.get('[data-testid="auditor-row"]').should('have.length.at.least', 3);

      // Click on specific auditor
      cy.get('[data-testid="auditor-row"]').first().click();
      cy.get('[data-testid="auditor-details-modal"]').should('be.visible');

      // Verify auditor metrics
      cy.get('[data-testid="cases-reviewed"]').should('be.visible');
      cy.get('[data-testid="avg-review-time"]').should('be.visible');
      cy.get('[data-testid="accuracy-score"]').should('be.visible');
      cy.get('[data-testid="productivity-score"]').should('be.visible');

      // Performance trends
      cy.get('[data-testid="performance-trend-chart"]').should('be.visible');
    });

    it('should show quality metrics', () => {
      cy.get('[data-testid="quality-metrics-section"]').should('be.visible');

      // Quality indicators
      cy.get('[data-testid="decision-accuracy"]').should('be.visible');
      cy.get('[data-testid="appeal-overturn-rate"]').should('be.visible');
      cy.get('[data-testid="peer-review-scores"]').should('be.visible');

      // Quality trends over time
      cy.get('[data-testid="quality-trends-chart"]').should('be.visible');
      
      // Quality by category
      cy.get('[data-testid="quality-by-category"]').should('be.visible');
      cy.get('[data-testid="category-cardiology"]').click();
      cy.get('[data-testid="category-details"]').should('be.visible');
    });

    it('should configure performance alerts', () => {
      cy.get('[data-testid="alerts-configuration"]').click();
      cy.get('[data-testid="alerts-config-modal"]').should('be.visible');

      // Configure SLA alerts
      cy.get('[data-testid="sla-alert-threshold"]').clear().type('48');
      cy.get('[data-testid="sla-alert-enabled"]').check();

      // Configure quality alerts
      cy.get('[data-testid="quality-threshold"]').clear().type('85');
      cy.get('[data-testid="quality-alert-enabled"]').check();

      // Configure productivity alerts
      cy.get('[data-testid="productivity-threshold"]').clear().type('10');
      cy.get('[data-testid="productivity-alert-enabled"]').check();

      cy.get('[data-testid="save-alert-config"]').click();
      cy.wait('@saveAlertConfig');

      checkNotification('Alert configuration saved', 'success');
    });
  });

  describe('Comparative Analytics', () => {
    it('should compare performance across time periods', () => {
      cy.get('[data-testid="comparative-analysis-tab"]').click();
      cy.get('[data-testid="time-comparison-section"]').should('be.visible');

      // Set comparison periods
      cy.get('[data-testid="period-1-start"]').type('2024-01-01');
      cy.get('[data-testid="period-1-end"]').type('2024-03-31');
      cy.get('[data-testid="period-2-start"]').type('2024-04-01');
      cy.get('[data-testid="period-2-end"]').type('2024-06-30');

      cy.get('[data-testid="run-comparison"]').click();
      cy.wait('@runTimeComparison');

      // Verify comparison results
      cy.get('[data-testid="comparison-chart"]').should('be.visible');
      cy.get('[data-testid="period-1-metrics"]').should('be.visible');
      cy.get('[data-testid="period-2-metrics"]').should('be.visible');
      cy.get('[data-testid="variance-indicators"]').should('be.visible');
    });

    it('should compare performance across departments', () => {
      cy.get('[data-testid="department-comparison-section"]').should('be.visible');

      // Select departments to compare
      cy.get('[data-testid="dept-cardiology"]').check();
      cy.get('[data-testid="dept-orthopedics"]').check();
      cy.get('[data-testid="dept-oncology"]').check();

      cy.get('[data-testid="compare-departments"]').click();
      cy.wait('@compareDepartments');

      // Verify comparison visualization
      cy.get('[data-testid="department-comparison-chart"]').should('be.visible');
      cy.get('[data-testid="best-performing-dept"]').should('be.visible');
      cy.get('[data-testid="improvement-opportunities"]').should('be.visible');
    });

    it('should benchmark against industry standards', () => {
      cy.get('[data-testid="benchmark-tab"]').click();
      cy.get('[data-testid="industry-benchmark-section"]').should('be.visible');

      // Select benchmark categories
      cy.get('[data-testid="benchmark-processing-time"]').check();
      cy.get('[data-testid="benchmark-approval-rate"]').check();
      cy.get('[data-testid="benchmark-cost-per-case"]').check();

      cy.get('[data-testid="load-benchmarks"]').click();
      cy.wait('@loadIndustryBenchmarks');

      // Verify benchmark comparison
      cy.get('[data-testid="benchmark-chart"]').should('be.visible');
      cy.get('[data-testid="performance-vs-benchmark"]').should('be.visible');
      cy.get('[data-testid="benchmark-percentile"]').should('be.visible');
    });
  });

  describe('Real-time Monitoring', () => {
    it('should display real-time case processing status', () => {
      cy.get('[data-testid="real-time-tab"]').click();
      cy.get('[data-testid="real-time-dashboard"]').should('be.visible');

      // Real-time metrics
      cy.get('[data-testid="active-cases-counter"]').should('be.visible');
      cy.get('[data-testid="cases-in-queue"]').should('be.visible');
      cy.get('[data-testid="avg-wait-time"]').should('be.visible');

      // Live activity feed
      cy.get('[data-testid="activity-feed"]').should('be.visible');
      cy.get('[data-testid="activity-item"]').should('have.length.at.least', 1);

      // Auto-refresh verification
      cy.get('[data-testid="auto-refresh-enabled"]').should('be.visible');
      cy.get('[data-testid="last-refresh-time"]').should('be.visible');
    });

    it('should show system health indicators', () => {
      cy.get('[data-testid="system-health-section"]').should('be.visible');

      // Health status indicators
      cy.get('[data-testid="api-health-status"]').should('contain', 'Healthy');
      cy.get('[data-testid="database-health-status"]').should('contain', 'Healthy');
      cy.get('[data-testid="ai-service-health-status"]').should('be.visible');

      // Performance metrics
      cy.get('[data-testid="response-time-metric"]').should('be.visible');
      cy.get('[data-testid="throughput-metric"]').should('be.visible');
      cy.get('[data-testid="error-rate-metric"]').should('be.visible');
    });

    it('should handle real-time alerts and notifications', () => {
      // Simulate high-priority alert
      cy.task('queryDatabase', {
        sql: 'INSERT INTO alerts (type, severity, message, created_at) VALUES ($1, $2, $3, NOW())',
        params: ['sla_breach', 'high', 'Case processing time exceeded SLA threshold']
      });

      // Wait for real-time update
      cy.wait(3000);

      // Verify alert appears
      cy.get('[data-testid="alert-notification"]').should('be.visible');
      cy.get('[data-testid="alert-severity-high"]').should('be.visible');
      cy.get('[data-testid="alert-message"]').should('contain', 'SLA threshold');

      // Acknowledge alert
      cy.get('[data-testid="acknowledge-alert"]').click();
      cy.get('[data-testid="alert-acknowledged"]').should('be.visible');
    });
  });

  describe('Dashboard Accessibility and Usability', () => {
    it('should be keyboard navigable', () => {
      // Tab through dashboard elements
      cy.get('body').tab();
      cy.focused().should('have.attr', 'data-testid', 'dashboard-header');
      
      cy.focused().tab();
      cy.focused().should('have.attr', 'data-testid').and('contain', 'kpi');
      
      // Navigate through charts with keyboard
      cy.get('[data-testid="case-volume-chart"]').focus();
      cy.focused().type('{rightarrow}');
      cy.get('[data-testid="chart-focus-indicator"]').should('be.visible');
    });

    it('should support high contrast mode', () => {
      cy.get('[data-testid="accessibility-menu"]').click();
      cy.get('[data-testid="high-contrast-toggle"]').click();

      // Verify high contrast styles applied
      cy.get('[data-testid="dashboard-container"]').should('have.class', 'high-contrast');
      cy.get('[data-testid="kpi-card"]').should('have.css', 'border-width', '2px');
    });

    it('should provide screen reader support', () => {
      // Verify ARIA labels and descriptions
      cy.get('[data-testid="case-volume-chart"]')
        .should('have.attr', 'aria-label')
        .and('contain', 'Case volume over time');

      cy.get('[data-testid="kpi-total-cases"]')
        .should('have.attr', 'aria-describedby');

      // Check for screen reader announcements
      cy.get('[data-testid="sr-live-region"]').should('exist');
    });
  });
});