/**
 * Healthcare Offline Synchronization Service
 * Manages offline data storage, conflict resolution, and sync operations
 * for healthcare quality control workflows
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Database Schema Definition
interface OfflineDB extends DBSchema {
  cases: {
    key: string;
    value: CaseData;
    indexes: {
      'by-priority': string;
      'by-status': string;
      'by-date': Date;
      'by-offline-status': boolean;
    };
  };
  sync_queue: {
    key: string;
    value: SyncOperation;
    indexes: {
      'by-timestamp': Date;
      'by-operation': string;
      'by-priority': number;
    };
  };
  app_state: {
    key: string;
    value: AppStateData;
  };
  emergency_data: {
    key: string;
    value: EmergencyData;
  };
  user_preferences: {
    key: string;
    value: UserPreferences;
  };
}

// Type Definitions
interface CaseData {
  id: string;
  patientId: string;
  patientName: string;
  patientAge: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'requires_action';
  type: string;
  title: string;
  description: string;
  submittedBy: string;
  submittedDate: Date;
  dueDate?: Date;
  location?: string;
  contactInfo?: string;
  attachments?: FileAttachment[];
  comments?: CaseComment[];
  lastModified: Date;
  isOfflineModified: boolean;
  conflictResolutionData?: ConflictData;
}

interface SyncOperation {
  id: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT';
  entityType: 'case' | 'comment' | 'attachment';
  entityId: string;
  data: any;
  timestamp: Date;
  priority: number; // 1 = highest, 5 = lowest
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  userId: string;
}

interface AppStateData {
  key: string;
  data: any;
  lastUpdated: Date;
  version: number;
}

interface EmergencyData {
  id: string;
  type: 'contact' | 'protocol' | 'medication' | 'procedure';
  data: any;
  lastUpdated: Date;
  criticalLevel: number;
}

interface UserPreferences {
  userId: string;
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    notifications: boolean;
    offlineMode: boolean;
    emergencyAlerts: boolean;
    autoSync: boolean;
    syncInterval: number;
  };
  lastUpdated: Date;
}

interface FileAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  localBlob?: Blob;
  isOffline: boolean;
}

interface CaseComment {
  id: string;
  text: string;
  author: string;
  timestamp: Date;
  isOffline: boolean;
}

interface ConflictData {
  serverVersion: CaseData;
  localVersion: CaseData;
  conflictFields: string[];
  resolutionStrategy: 'manual' | 'server_wins' | 'local_wins' | 'merge';
}

interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  conflicts: ConflictData[];
  errors: string[];
}

class OfflineSyncService {
  private db: IDBPDatabase<OfflineDB> | null = null;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private syncListeners: ((result: SyncResult) => void)[] = [];
  private conflictResolvers: Map<string, (conflict: ConflictData) => Promise<CaseData>> = new Map();

  constructor() {
    this.initializeDatabase();
    this.setupEventListeners();
    this.registerConflictResolvers();
  }

  /**
   * Initialize IndexedDB database
   */
  private async initializeDatabase(): Promise<void> {
    try {
      this.db = await openDB<OfflineDB>('QualityControlOffline', 3, {
        upgrade(db: any, oldVersion: number, newVersion: number | null, transaction: any) {
          // Cases store
          if (!db.objectStoreNames.contains('cases')) {
            const casesStore = db.createObjectStore('cases', { keyPath: 'id' });
            casesStore.createIndex('by-priority', 'priority');
            casesStore.createIndex('by-status', 'status');
            casesStore.createIndex('by-date', 'submittedDate');
            casesStore.createIndex('by-offline-status', 'isOfflineModified');
          }

          // Sync queue store
          if (!db.objectStoreNames.contains('sync_queue')) {
            const syncStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
            syncStore.createIndex('by-timestamp', 'timestamp');
            syncStore.createIndex('by-operation', 'operation');
            syncStore.createIndex('by-priority', 'priority');
          }

          // App state store
          if (!db.objectStoreNames.contains('app_state')) {
            db.createObjectStore('app_state', { keyPath: 'key' });
          }

          // Emergency data store
          if (!db.objectStoreNames.contains('emergency_data')) {
            const emergencyStore = db.createObjectStore('emergency_data', { keyPath: 'id' });
            emergencyStore.createIndex('by-type', 'type');
          }

          // User preferences store
          if (!db.objectStoreNames.contains('user_preferences')) {
            db.createObjectStore('user_preferences', { keyPath: 'userId' });
          }
        },
      });

      await this.initializeEmergencyData();
      console.log('OfflineSync: Database initialized successfully');
    } catch (error) {
      console.error('OfflineSync: Failed to initialize database:', error);
    }
  }

  /**
   * Setup event listeners for online/offline status
   */
  private setupEventListeners(): void {
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));
    
    // Background sync registration
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then(registration => {
        return registration.sync?.register('qualitycontrol-sync');
      });
    }
  }

  /**
   * Register conflict resolution strategies
   */
  private registerConflictResolvers(): void {
    // Server wins resolver
    this.conflictResolvers.set('server_wins', async (conflict) => {
      return conflict.serverVersion;
    });

    // Local wins resolver
    this.conflictResolvers.set('local_wins', async (conflict) => {
      return conflict.localVersion;
    });

    // Smart merge resolver
    this.conflictResolvers.set('merge', async (conflict) => {
      const merged = { ...conflict.serverVersion };
      
      // Apply local changes that don't conflict
      if (conflict.localVersion.comments && conflict.localVersion.comments.length > 0) {
        const localComments = conflict.localVersion.comments.filter(c => c.isOffline);
        merged.comments = [...(merged.comments || []), ...localComments];
      }

      // Keep local priority if it's more urgent
      if (this.getPriorityWeight(conflict.localVersion.priority) > 
          this.getPriorityWeight(conflict.serverVersion.priority)) {
        merged.priority = conflict.localVersion.priority;
      }

      return merged;
    });
  }

  /**
   * Handle online event
   */
  private async handleOnline(): Promise<void> {
    console.log('OfflineSync: Connection restored');
    this.isOnline = true;
    
    // Start background sync
    await this.syncOfflineData();
  }

  /**
   * Handle offline event
   */
  private handleOffline(): void {
    console.log('OfflineSync: Connection lost');
    this.isOnline = false;
  }

  /**
   * Initialize emergency data for offline access
   */
  private async initializeEmergencyData(): Promise<void> {
    if (!this.db) return;

    const emergencyData: EmergencyData[] = [
      {
        id: 'emergency-contacts',
        type: 'contact',
        data: [
          { name: 'Emergency Services', phone: '911', type: 'emergency' },
          { name: 'Poison Control', phone: '1-800-222-1222', type: 'poison' },
          { name: 'Hospital Security', phone: 'ext. 2911', type: 'security' },
          { name: 'IT Support', phone: 'ext. 4357', type: 'technical' }
        ],
        lastUpdated: new Date(),
        criticalLevel: 1
      },
      {
        id: 'critical-protocols',
        type: 'protocol',
        data: [
          {
            id: 'cardiac-arrest',
            title: 'Cardiac Arrest Protocol',
            steps: [
              'Call emergency services immediately',
              'Begin CPR if trained',
              'Use AED if available',
              'Continue until help arrives'
            ],
            priority: 'critical'
          },
          {
            id: 'stroke-assessment',
            title: 'Stroke Assessment (FAST)',
            steps: [
              'Face: Check for facial drooping',
              'Arms: Check for arm weakness',
              'Speech: Check for speech difficulty',
              'Time: Note time of onset, call 911'
            ],
            priority: 'critical'
          }
        ],
        lastUpdated: new Date(),
        criticalLevel: 1
      }
    ];

    const tx = this.db.transaction('emergency_data', 'readwrite');
    for (const data of emergencyData) {
      await tx.store.put(data);
    }
    await tx.done;
  }

  /**
   * Store case data offline
   */
  async storeCaseOffline(caseData: Partial<CaseData>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fullCaseData: CaseData = {
      ...caseData,
      lastModified: new Date(),
      isOfflineModified: true
    } as CaseData;

    await this.db.put('cases', fullCaseData);
    
    // Add to sync queue
    await this.addToSyncQueue({
      operation: caseData.id ? 'UPDATE' : 'CREATE',
      entityType: 'case',
      entityId: fullCaseData.id,
      data: fullCaseData,
      priority: this.getPriorityWeight(fullCaseData.priority)
    });

    console.log('OfflineSync: Case stored offline:', fullCaseData.id);
  }

  /**
   * Get cases from offline storage
   */
  async getCasesOffline(filters?: {
    priority?: string;
    status?: string;
    limit?: number;
  }): Promise<CaseData[]> {
    if (!this.db) return [];

    let cases: CaseData[];

    if (filters?.priority) {
      cases = await this.db.getAllFromIndex('cases', 'by-priority', filters.priority);
    } else if (filters?.status) {
      cases = await this.db.getAllFromIndex('cases', 'by-status', filters.status);
    } else {
      cases = await this.db.getAll('cases');
    }

    // Sort by priority and date
    cases.sort((a, b) => {
      const aPriority = this.getPriorityWeight(a.priority);
      const bPriority = this.getPriorityWeight(b.priority);
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      return b.submittedDate.getTime() - a.submittedDate.getTime(); // Newer first
    });

    return filters?.limit ? cases.slice(0, filters.limit) : cases;
  }

  /**
   * Add operation to sync queue
   */
  private async addToSyncQueue(operation: Partial<SyncOperation>): Promise<void> {
    if (!this.db) return;

    const syncOp: SyncOperation = {
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: 3,
      userId: 'current_user', // Get from auth state
      ...operation
    } as SyncOperation;

    await this.db.put('sync_queue', syncOp);
    
    // Try immediate sync if online
    if (this.isOnline && !this.syncInProgress) {
      this.syncOfflineData();
    }
  }

  /**
   * Sync offline data with server
   */
  async syncOfflineData(): Promise<SyncResult> {
    if (!this.db || this.syncInProgress || !this.isOnline) {
      return {
        success: false,
        syncedCount: 0,
        failedCount: 0,
        conflicts: [],
        errors: ['Sync conditions not met']
      };
    }

    this.syncInProgress = true;
    console.log('OfflineSync: Starting sync process');

    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      conflicts: [],
      errors: []
    };

    try {
      // Get all pending sync operations, ordered by priority
      const syncOps = await this.db.getAllFromIndex('sync_queue', 'by-priority');
      
      for (const op of syncOps) {
        try {
          await this.processSyncOperation(op, result);
          
          // Remove successful operation from queue
          await this.db.delete('sync_queue', op.id);
          result.syncedCount++;
          
        } catch (error) {
          console.error('OfflineSync: Failed to process operation:', op.id, error);
          
          // Update retry count
          op.retryCount++;
          op.lastError = error instanceof Error ? error.message : String(error);
          
          if (op.retryCount >= op.maxRetries) {
            // Remove failed operation after max retries
            await this.db.delete('sync_queue', op.id);
            result.failedCount++;
            result.errors.push(`Max retries exceeded for operation ${op.id}: ${op.lastError}`);
          } else {
            // Update operation with new retry count
            await this.db.put('sync_queue', op);
          }
        }
      }

      // Notify sync listeners
      this.syncListeners.forEach(listener => listener(result));
      
    } catch (error) {
      console.error('OfflineSync: Sync process failed:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      this.syncInProgress = false;
    }

    console.log('OfflineSync: Sync completed:', result);
    return result;
  }

  /**
   * Process individual sync operation
   */
  private async processSyncOperation(op: SyncOperation, result: SyncResult): Promise<void> {
    switch (op.operation) {
      case 'CREATE':
        await this.syncCreateOperation(op, result);
        break;
      case 'UPDATE':
        await this.syncUpdateOperation(op, result);
        break;
      case 'DELETE':
        await this.syncDeleteOperation(op, result);
        break;
      case 'APPROVE':
      case 'REJECT':
        await this.syncStatusOperation(op, result);
        break;
    }
  }

  /**
   * Sync create operation
   */
  private async syncCreateOperation(op: SyncOperation, result: SyncResult): Promise<void> {
    const response = await fetch('/api/cases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify(op.data)
    });

    if (!response.ok) {
      throw new Error(`Create failed: ${response.statusText}`);
    }

    const createdCase = await response.json();
    
    // Update local storage with server-assigned ID
    if (this.db && createdCase.id !== op.entityId) {
      await this.db.delete('cases', op.entityId);
      await this.db.put('cases', { ...createdCase, isOfflineModified: false });
    }
  }

  /**
   * Sync update operation
   */
  private async syncUpdateOperation(op: SyncOperation, result: SyncResult): Promise<void> {
    // First, get current server version
    const serverResponse = await fetch(`/api/cases/${op.entityId}`, {
      headers: {
        'Authorization': `Bearer ${this.getAuthToken()}`
      }
    });

    if (!serverResponse.ok) {
      throw new Error(`Failed to fetch server version: ${serverResponse.statusText}`);
    }

    const serverVersion = await serverResponse.json();
    const localVersion = op.data as CaseData;

    // Check for conflicts
    if (serverVersion.lastModified > localVersion.lastModified) {
      const conflict: ConflictData = {
        serverVersion,
        localVersion,
        conflictFields: this.detectConflictFields(serverVersion, localVersion),
        resolutionStrategy: 'manual' // Default to manual resolution
      };

      // Try automatic resolution first
      const resolvedData = await this.resolveConflict(conflict);
      
      if (resolvedData) {
        // Apply resolved data
        const updateResponse = await fetch(`/api/cases/${op.entityId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getAuthToken()}`
          },
          body: JSON.stringify(resolvedData)
        });

        if (!updateResponse.ok) {
          throw new Error(`Update failed: ${updateResponse.statusText}`);
        }

        const updatedCase = await updateResponse.json();
        
        // Update local storage
        if (this.db) {
          await this.db.put('cases', { ...updatedCase, isOfflineModified: false });
        }
      } else {
        // Manual resolution required
        result.conflicts.push(conflict);
      }
    } else {
      // No conflict, proceed with update
      const updateResponse = await fetch(`/api/cases/${op.entityId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify(localVersion)
      });

      if (!updateResponse.ok) {
        throw new Error(`Update failed: ${updateResponse.statusText}`);
      }

      const updatedCase = await updateResponse.json();
      
      // Update local storage
      if (this.db) {
        await this.db.put('cases', { ...updatedCase, isOfflineModified: false });
      }
    }
  }

  /**
   * Sync delete operation
   */
  private async syncDeleteOperation(op: SyncOperation, result: SyncResult): Promise<void> {
    const response = await fetch(`/api/cases/${op.entityId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.getAuthToken()}`
      }
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Delete failed: ${response.statusText}`);
    }

    // Remove from local storage
    if (this.db) {
      await this.db.delete('cases', op.entityId);
    }
  }

  /**
   * Sync status operation (approve/reject)
   */
  private async syncStatusOperation(op: SyncOperation, result: SyncResult): Promise<void> {
    const endpoint = op.operation === 'APPROVE' ? 'approve' : 'reject';
    const response = await fetch(`/api/cases/${op.entityId}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify(op.data)
    });

    if (!response.ok) {
      throw new Error(`${op.operation} failed: ${response.statusText}`);
    }

    const updatedCase = await response.json();
    
    // Update local storage
    if (this.db) {
      await this.db.put('cases', { ...updatedCase, isOfflineModified: false });
    }
  }

  /**
   * Detect conflict fields between server and local versions
   */
  private detectConflictFields(serverVersion: CaseData, localVersion: CaseData): string[] {
    const conflicts: string[] = [];
    const fieldsToCheck = ['status', 'priority', 'description', 'title', 'dueDate'];

    for (const field of fieldsToCheck) {
      if (JSON.stringify(serverVersion[field as keyof CaseData]) !== 
          JSON.stringify(localVersion[field as keyof CaseData])) {
        conflicts.push(field);
      }
    }

    return conflicts;
  }

  /**
   * Resolve conflict using registered resolvers
   */
  private async resolveConflict(conflict: ConflictData): Promise<CaseData | null> {
    const resolver = this.conflictResolvers.get(conflict.resolutionStrategy);
    
    if (resolver) {
      return await resolver(conflict);
    }

    // Default to manual resolution
    return null;
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: string): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  /**
   * Get authentication token
   */
  private getAuthToken(): string {
    // Get from your auth service/store
    return localStorage.getItem('auth_token') || '';
  }

  /**
   * Get emergency data for offline access
   */
  async getEmergencyData(type?: string): Promise<EmergencyData[]> {
    if (!this.db) return [];

    if (type) {
      return await this.db.getAllFromIndex('emergency_data', 'by-type', type);
    }

    return await this.db.getAll('emergency_data');
  }

  /**
   * Store app state for offline persistence
   */
  async storeAppState(key: string, data: any): Promise<void> {
    if (!this.db) return;

    const stateData: AppStateData = {
      key,
      data,
      lastUpdated: new Date(),
      version: 1
    };

    await this.db.put('app_state', stateData);
  }

  /**
   * Get app state from offline storage
   */
  async getAppState(key: string): Promise<any> {
    if (!this.db) return null;

    const stateData = await this.db.get('app_state', key);
    return stateData?.data || null;
  }

  /**
   * Add sync listener
   */
  addSyncListener(listener: (result: SyncResult) => void): void {
    this.syncListeners.push(listener);
  }

  /**
   * Remove sync listener
   */
  removeSyncListener(listener: (result: SyncResult) => void): void {
    const index = this.syncListeners.indexOf(listener);
    if (index > -1) {
      this.syncListeners.splice(index, 1);
    }
  }

  /**
   * Get sync queue status
   */
  async getSyncQueueStatus(): Promise<{
    pendingCount: number;
    lastSyncTime: Date | null;
    hasErrors: boolean;
  }> {
    if (!this.db) {
      return { pendingCount: 0, lastSyncTime: null, hasErrors: false };
    }

    const syncOps = await this.db.getAll('sync_queue');
    const hasErrors = syncOps.some((op: any) => op.retryCount > 0);
    
    // Get last sync time from app state
    const lastSyncData = await this.getAppState('last_sync_time');
    
    return {
      pendingCount: syncOps.length,
      lastSyncTime: lastSyncData ? new Date(lastSyncData) : null,
      hasErrors
    };
  }

  /**
   * Force sync operation
   */
  async forceSyncNow(): Promise<SyncResult> {
    if (this.isOnline) {
      return await this.syncOfflineData();
    }
    
    return {
      success: false,
      syncedCount: 0,
      failedCount: 0,
      conflicts: [],
      errors: ['Device is offline']
    };
  }

  /**
   * Clear all offline data (use with caution)
   */
  async clearOfflineData(): Promise<void> {
    if (!this.db) return;

    const tx = this.db.transaction(['cases', 'sync_queue', 'app_state'], 'readwrite');
    await Promise.all([
      tx.objectStore('cases').clear(),
      tx.objectStore('sync_queue').clear(),
      tx.objectStore('app_state').clear()
    ]);
    await tx.done;

    console.log('OfflineSync: All offline data cleared');
  }
}

// Export singleton instance
export const offlineSyncService = new OfflineSyncService();
export type { CaseData, SyncResult, ConflictData, EmergencyData };