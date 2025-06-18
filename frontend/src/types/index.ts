export interface User {
  id: string;
  email: string;
  name: string;
  role: 'physician' | 'nurse' | 'administrator' | 'technician';
  permissions: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Case {
  id: string;
  title: string;
  description: string;
  patientId: string;
  patientName: string;
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedTo: string;
  assignedToId: string;
  createdBy: string;
  createdById: string;
  tags?: string[];
  attachments?: Attachment[];
  notes?: Note[];
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  caseId: string;
  content: string;
  author: string;
  authorId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Attachment {
  id: string;
  caseId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  url: string;
  uploadedBy: string;
  uploadedById: string;
  createdAt: string;
}

export interface Dashboard {
  totalCases: number;
  activeCases: number;
  resolvedToday: number;
  criticalCases: number;
  casesByStatus: {
    open: number;
    in_progress: number;
    resolved: number;
    closed: number;
  };
  casesByPriority: {
    high: number;
    medium: number;
    low: number;
  };
  recentActivity: Activity[];
}

export interface Activity {
  id: string;
  type: 'case_created' | 'case_updated' | 'case_resolved' | 'comment_added' | 'user_assigned';
  description: string;
  entityId: string;
  entityType: 'case' | 'user';
  user: string;
  userId: string;
  timestamp: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  status: 'success' | 'error';
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}