export interface User {
  id: string;
  name: string;
  email: string;
  role: 'auditor' | 'admin' | 'viewer';
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditCase {
  id: string;
  patientId: string;
  patientName: string;
  procedureCode: string;
  procedureDescription: string;
  value: number;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_review' | 'approved' | 'denied' | 'partial';
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
  aIAnalysis?: AIAnalysis;
}

export interface AIAnalysis {
  id: string;
  caseId: string;
  recommendation: 'approve' | 'deny' | 'partial' | 'review';
  confidence: number;
  reasoning: string;
  riskScore: number;
  fraudIndicators: string[];
  similarCases: string[];
  createdAt: string;
}

export interface Decision {
  id: string;
  caseId: string;
  auditorId: string;
  decision: 'approved' | 'denied' | 'partial';
  justification: string;
  aiConfidence?: number;
  timestamp: string;
  processingTime: number; // in seconds
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  context?: any;
}