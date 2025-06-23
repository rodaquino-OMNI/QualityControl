/**
 * Global type declarations for the QualityControl PWA
 */

// Google Analytics gtag function
declare function gtag(command: 'config' | 'event' | 'get' | 'set', targetId: string, config?: any): void;

// Navigator interface extensions
interface Navigator {
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
    addEventListener?: (event: string, listener: () => void) => void;
    removeEventListener?: (event: string, listener: () => void) => void;
  };
  deviceMemory?: number;
}

// ServiceWorkerRegistration interface extension
interface ServiceWorkerRegistration {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
}

// NotificationOptions interface extension
interface NotificationOptions {
  vibrate?: number[] | number;
  actions?: NotificationAction[];
}

interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

// Window interface extensions
interface Window {
  gtag?: typeof gtag;
}

// IDB module declaration
declare module 'idb' {
  export function openDB<DBTypes = unknown>(
    name: string,
    version?: number,
    {
      upgrade,
      blocked,
      blocking,
      terminated,
    }?: {
      upgrade?: (database: any, oldVersion: number, newVersion: number | null, transaction: any) => void;
      blocked?: () => void;
      blocking?: () => void;
      terminated?: () => void;
    }
  ): Promise<any>;
  
  export interface DBSchema {
    [key: string]: {
      key: any;
      value: any;
      indexes?: {
        [indexName: string]: any;
      };
    };
  }
  
  export interface IDBPDatabase<DBTypes = unknown> {
    put(storeName: string, value: any): Promise<any>;
    get(storeName: string, key: any): Promise<any>;
    getAll(storeName: string): Promise<any[]>;
    getAllFromIndex(storeName: string, indexName: string, query?: any): Promise<any[]>;
    delete(storeName: string, key: any): Promise<void>;
    transaction(storeNames: string | string[], mode?: 'readonly' | 'readwrite'): any;
    createObjectStore(name: string, options?: any): any;
    objectStoreNames: DOMStringList;
  }
}