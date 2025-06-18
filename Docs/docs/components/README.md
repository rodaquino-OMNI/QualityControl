# Component Documentation

This document provides comprehensive documentation for all React components in the AUSTA Cockpit frontend application.

## Table of Contents

1. [Component Structure](#component-structure)
2. [Common Components](#common-components)
3. [Layout Components](#layout-components)
4. [Authentication Components](#authentication-components)
5. [Case Management Components](#case-management-components)
6. [Analytics Components](#analytics-components)
7. [Dashboard Components](#dashboard-components)
8. [Component Guidelines](#component-guidelines)

## Component Structure

All components follow a consistent structure:

```typescript
// ComponentName.tsx
import React from 'react';
import { ComponentProps } from './types';
import styles from './ComponentName.module.css';

export interface ComponentNameProps {
  // Props definition
}

export const ComponentName: React.FC<ComponentNameProps> = ({
  prop1,
  prop2,
  ...rest
}) => {
  // Component logic
  
  return (
    <div className={styles.container}>
      {/* Component JSX */}
    </div>
  );
};

ComponentName.displayName = 'ComponentName';
```

## Common Components

### Icons.tsx

Custom icon components used throughout the application.

```typescript
interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

// Usage
<Icons.Dashboard size={24} color="#1a73e8" />
<Icons.Case className="text-gray-600" />
<Icons.Analytics size={20} />
```

**Available Icons:**
- `Dashboard` - Dashboard icon
- `Case` - Medical case icon
- `Analytics` - Chart/analytics icon
- `User` - User profile icon
- `Settings` - Settings gear icon
- `Notification` - Bell icon
- `Search` - Search magnifier
- `Filter` - Filter funnel
- `Export` - Export/download icon
- `AI` - AI/robot icon

### LoadingSpinner.tsx

Loading indicator component with multiple variants.

```typescript
interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  variant?: 'primary' | 'secondary' | 'white';
  fullScreen?: boolean;
  text?: string;
}

// Usage
<LoadingSpinner />
<LoadingSpinner size="large" text="Carregando casos..." />
<LoadingSpinner variant="white" fullScreen />
```

## Layout Components

### MainLayout.tsx

Main application layout wrapper that provides the overall structure.

```typescript
interface MainLayoutProps {
  children: React.ReactNode;
}

// Features:
// - Responsive sidebar navigation
// - Header with user menu
// - Main content area with proper spacing
// - Mobile-optimized layout

// Usage
<MainLayout>
  <YourPageContent />
</MainLayout>
```

### Header.tsx

Application header with navigation and user controls.

```typescript
interface HeaderProps {
  onMenuClick?: () => void;
  showNotifications?: boolean;
  user?: User;
}

// Features:
// - Logo and branding
// - Search bar (optional)
// - Notification bell with badge
// - User menu with avatar
// - Mobile menu toggle

// Usage
<Header 
  onMenuClick={toggleSidebar}
  showNotifications={true}
  user={currentUser}
/>
```

### Sidebar.tsx

Navigation sidebar with collapsible menu items.

```typescript
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeRoute?: string;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ComponentType;
  path: string;
  badge?: number;
  children?: MenuItem[];
}

// Features:
// - Collapsible on mobile
// - Active route highlighting
// - Nested menu support
// - Badge indicators
// - Role-based menu filtering

// Usage
<Sidebar 
  isOpen={sidebarOpen}
  onClose={() => setSidebarOpen(false)}
  activeRoute="/cases"
/>
```

## Authentication Components

### AuthLayout.tsx

Layout wrapper for authentication pages.

```typescript
interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

// Features:
// - Centered content box
// - Background pattern/image
// - Logo and branding
// - Responsive design

// Usage
<AuthLayout 
  title="Bem-vindo de volta"
  subtitle="Faça login para continuar"
>
  <LoginForm />
</AuthLayout>
```

### LoginForm.tsx

User login form with validation.

```typescript
interface LoginFormProps {
  onSuccess?: (user: User) => void;
  onError?: (error: Error) => void;
  redirectTo?: string;
}

// Features:
// - Email/password validation
// - Remember me option
// - Loading states
// - Error handling
// - MFA support
// - Social login options

// Usage
<LoginForm 
  onSuccess={(user) => navigate('/dashboard')}
  redirectTo="/dashboard"
/>
```

### MFASettings.tsx

Multi-factor authentication settings component.

```typescript
interface MFASettingsProps {
  user: User;
  onUpdate?: (settings: MFASettings) => void;
}

// Features:
// - Enable/disable MFA
// - QR code generation
// - Backup codes
// - SMS/Email options
// - App-based authentication

// Usage
<MFASettings 
  user={currentUser}
  onUpdate={handleMFAUpdate}
/>
```

### PrivateRoute.tsx

Route wrapper for authenticated pages.

```typescript
interface PrivateRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiredPermissions?: string[];
  fallbackPath?: string;
}

// Features:
// - Authentication check
// - Role-based access control
// - Permission validation
// - Redirect handling
// - Loading states

// Usage
<PrivateRoute requiredRole="auditor">
  <AuditorDashboard />
</PrivateRoute>
```

## Case Management Components

### CaseListItem.tsx

Individual case item for list views.

```typescript
interface CaseListItemProps {
  case: Case;
  onClick?: (case: Case) => void;
  onAssign?: (case: Case) => void;
  showActions?: boolean;
  isSelected?: boolean;
}

// Features:
// - Case summary display
// - Priority indicator
// - Status badge
// - Quick actions
// - AI confidence score
// - Hover states

// Usage
<CaseListItem 
  case={caseData}
  onClick={handleCaseClick}
  showActions={true}
/>
```

### CaseFilters.tsx

Advanced filtering controls for case lists.

```typescript
interface CaseFiltersProps {
  filters: CaseFilters;
  onChange: (filters: CaseFilters) => void;
  onReset?: () => void;
  availableFilters?: string[];
}

interface CaseFilters {
  status?: CaseStatus[];
  priority?: Priority[];
  dateRange?: DateRange;
  assignedTo?: string;
  search?: string;
  procedureCode?: string[];
  valueRange?: ValueRange;
}

// Features:
// - Multi-select dropdowns
// - Date range picker
// - Search input
// - Value range slider
// - Filter chips
// - Save filter presets

// Usage
<CaseFilters 
  filters={currentFilters}
  onChange={setFilters}
  onReset={resetFilters}
/>
```

## Analytics Components

### AnalyticsDashboard.tsx

Main analytics dashboard container.

```typescript
interface AnalyticsDashboardProps {
  dateRange: DateRange;
  filters?: AnalyticsFilters;
  onExport?: (data: AnalyticsData) => void;
}

// Features:
// - Multiple chart types
// - Real-time updates
// - Export functionality
// - Responsive grid layout
// - Drill-down capabilities

// Usage
<AnalyticsDashboard 
  dateRange={selectedDateRange}
  filters={analyticsFilters}
  onExport={handleExport}
/>
```

### MetricsOverview.tsx

High-level metrics summary component.

```typescript
interface MetricsOverviewProps {
  metrics: MetricsSummary;
  period: Period;
  compareWith?: Period;
  loading?: boolean;
}

interface MetricsSummary {
  totalCases: number;
  approvalRate: number;
  averageTime: number;
  aiAccuracy: number;
  costSavings: number;
  fraudDetected: number;
}

// Features:
// - KPI cards with trends
// - Period comparison
// - Percentage changes
// - Sparkline charts
// - Drill-down links

// Usage
<MetricsOverview 
  metrics={dashboardMetrics}
  period="month"
  compareWith="lastMonth"
/>
```

### KPICard.tsx

Key Performance Indicator display card.

```typescript
interface KPICardProps {
  title: string;
  value: number | string;
  unit?: string;
  change?: number;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon?: React.ComponentType;
  trend?: number[];
  onClick?: () => void;
}

// Features:
// - Value formatting
// - Change indicators
// - Trend sparkline
// - Icon display
// - Click actions
// - Loading states

// Usage
<KPICard 
  title="Taxa de Aprovação"
  value={87.5}
  unit="%"
  change={5.2}
  changeType="positive"
  icon={Icons.TrendUp}
  trend={[80, 82, 85, 83, 87.5]}
/>
```

### AuditorPerformanceChart.tsx

Performance visualization for individual auditors.

```typescript
interface AuditorPerformanceChartProps {
  data: AuditorPerformance[];
  metric: 'cases' | 'time' | 'accuracy' | 'efficiency';
  chartType?: 'bar' | 'line' | 'radar';
  onAuditorClick?: (auditorId: string) => void;
}

// Features:
// - Multiple chart types
// - Metric selection
// - Interactive tooltips
// - Comparison mode
// - Export options

// Usage
<AuditorPerformanceChart 
  data={auditorData}
  metric="efficiency"
  chartType="bar"
  onAuditorClick={showAuditorDetails}
/>
```

### FraudDetectionVisualizer.tsx

Visualization for fraud detection patterns.

```typescript
interface FraudDetectionVisualizerProps {
  data: FraudData[];
  viewType?: 'heatmap' | 'network' | 'timeline';
  onNodeClick?: (node: FraudNode) => void;
  filters?: FraudFilters;
}

// Features:
// - Network graph view
// - Heatmap visualization
// - Timeline view
// - Interactive nodes
// - Risk scoring
// - Pattern highlighting

// Usage
<FraudDetectionVisualizer 
  data={fraudDetectionData}
  viewType="network"
  onNodeClick={investigateNode}
/>
```

### RealTimeMetrics.tsx

Live updating metrics display.

```typescript
interface RealTimeMetricsProps {
  metrics: string[];
  refreshInterval?: number;
  showGraph?: boolean;
  compact?: boolean;
}

// Features:
// - WebSocket connection
// - Auto-refresh
// - Live charts
// - Alert thresholds
// - Compact mode

// Usage
<RealTimeMetrics 
  metrics={['activeCases', 'queueLength', 'responseTime']}
  refreshInterval={5000}
  showGraph={true}
/>
```

## Dashboard Components

### StatsCard.tsx

Summary statistics card for dashboard.

```typescript
interface StatsCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: React.ComponentType;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  trend?: {
    value: number;
    label: string;
  };
}

// Features:
// - Color variants
// - Icon support
// - Trend indicators
// - Responsive sizing
// - Hover effects

// Usage
<StatsCard 
  title="Casos Pendentes"
  value={47}
  subtitle="Aguardando análise"
  icon={Icons.Clock}
  color="warning"
  trend={{ value: -15, label: "vs. ontem" }}
/>
```

### RecentActivity.tsx

Activity feed component showing recent system events.

```typescript
interface RecentActivityProps {
  activities: Activity[];
  limit?: number;
  onActivityClick?: (activity: Activity) => void;
  showFilters?: boolean;
}

interface Activity {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  user: User;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// Features:
// - Timeline view
// - Activity filtering
// - User avatars
// - Time formatting
// - Load more
// - Real-time updates

// Usage
<RecentActivity 
  activities={recentActivities}
  limit={10}
  onActivityClick={handleActivityClick}
  showFilters={true}
/>
```

## Component Guidelines

### Naming Conventions

1. **Component Files**: PascalCase (e.g., `UserProfile.tsx`)
2. **Component Names**: Match file names
3. **Props Interfaces**: ComponentName + "Props" (e.g., `UserProfileProps`)
4. **Event Handlers**: "on" + Event (e.g., `onClick`, `onChange`)
5. **Boolean Props**: "is", "has", "should" prefixes (e.g., `isLoading`, `hasError`)

### Best Practices

1. **TypeScript**: All components must be fully typed
2. **Props**: Use interface over type for component props
3. **Default Props**: Use default parameters instead of defaultProps
4. **Memo**: Use React.memo for expensive components
5. **Keys**: Always use stable, unique keys in lists

### Performance Optimization

1. **Lazy Loading**: Use React.lazy for route-based code splitting
2. **Memoization**: Use useMemo and useCallback appropriately
3. **Virtual Scrolling**: For large lists (>100 items)
4. **Image Optimization**: Use lazy loading and appropriate formats

### Accessibility

1. **ARIA Labels**: All interactive elements must have proper labels
2. **Keyboard Navigation**: Support Tab, Enter, and Escape keys
3. **Focus Management**: Proper focus indicators and management
4. **Screen Readers**: Test with screen readers
5. **Color Contrast**: WCAG AA compliance minimum

### Testing

Each component should have:
1. **Unit Tests**: Test component logic and rendering
2. **Integration Tests**: Test component interactions
3. **Accessibility Tests**: Use @testing-library/react
4. **Visual Tests**: Storybook snapshots

Example test structure:
```typescript
// ComponentName.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from './ComponentName';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<ComponentName onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Styling Guidelines

1. **Tailwind CSS**: Use utility classes for styling
2. **Component Classes**: Use CSS modules for component-specific styles
3. **Responsive Design**: Mobile-first approach
4. **Dark Mode**: Support both light and dark themes
5. **Animations**: Use Framer Motion for complex animations

### State Management

1. **Local State**: useState for component-specific state
2. **Global State**: Redux Toolkit for app-wide state
3. **Server State**: RTK Query or React Query
4. **Form State**: React Hook Form
5. **URL State**: React Router for navigation state