// Redux state type definitions

import { 
  User, 
  Case, 
  Notification,
  DashboardStats
} from '../../../shared/types';

// Auth state
export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  mfaRequired: boolean;
  mfaUserId?: string;
}

// UI state
export interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  activeModal: string | null;
  notifications: {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    duration?: number;
  } | null;
  isLoading: boolean;
  loadingMessage?: string;
}

// Cases state
export interface CasesState {
  items: Case[];
  selectedCase: Case | null;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
  filters: {
    search?: string;
    status?: string[];
    priority?: string[];
    type?: string[];
    assignedTo?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  sort: {
    field: string;
    order: 'asc' | 'desc';
  };
}

// Notifications state
export interface NotificationsState {
  items: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

// Dashboard state
export interface DashboardState {
  stats: DashboardStats | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refreshInterval: number;
}

// Users state
export interface UsersState {
  items: User[];
  selectedUser: User | null;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
  filters: {
    search?: string;
    role?: string;
    isActive?: boolean;
  };
}

// WebSocket state
export interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
  lastPing: string | null;
}

// Settings state
export interface SettingsState {
  general: {
    language: string;
    timezone: string;
    dateFormat: string;
    timeFormat: '12h' | '24h';
  };
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
    sound: boolean;
    caseUpdates: boolean;
    newAssignments: boolean;
    fraudAlerts: boolean;
  };
  display: {
    compactMode: boolean;
    showAvatars: boolean;
    animationsEnabled: boolean;
    highContrast: boolean;
  };
  privacy: {
    shareAnalytics: boolean;
    showOnlineStatus: boolean;
  };
}

// Combined root state
export interface RootState {
  auth: AuthState;
  ui: UIState;
  cases: CasesState;
  notifications: NotificationsState;
  dashboard: DashboardState;
  users: UsersState;
  websocket: WebSocketState;
  settings: SettingsState;
  api: any; // RTK Query adds its own state
}

// Action payload types
export interface LoginPayload {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface UpdateCasePayload {
  id: string;
  updates: Partial<Case>;
}

export interface SetFiltersPayload {
  filters: Partial<CasesState['filters']>;
}

export interface ShowNotificationPayload {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

export interface WebSocketMessagePayload {
  type: string;
  data: any;
}

// Selector return types
export interface CaseWithMetrics extends Case {
  metrics?: {
    processingTime?: number;
    touchpoints?: number;
    slaStatus?: 'on-time' | 'at-risk' | 'overdue';
  };
}

export interface UserWithStats extends User {
  stats?: {
    activeCases?: number;
    completedToday?: number;
    avgResponseTime?: number;
    satisfactionScore?: number;
  };
}

// Form state types
export interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isSubmitting: boolean;
  isValid: boolean;
}

// Modal state types
export interface ModalState {
  isOpen: boolean;
  data?: any;
  onConfirm?: () => void;
  onCancel?: () => void;
}

// Table state types
export interface TableState<T> {
  data: T[];
  columns: TableColumn<T>[];
  sorting: {
    field: keyof T;
    order: 'asc' | 'desc';
  } | null;
  filters: Record<string, any>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  selection: string[];
}

export interface TableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T) => React.ReactNode;
}

// Chart data types
export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
}

// Export action creators type helpers
export type AppDispatch = any; // Will be defined in store
export type AsyncThunkConfig = {
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: string;
};