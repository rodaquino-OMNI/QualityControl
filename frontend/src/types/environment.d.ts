// Frontend environment variable type definitions

/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API Configuration
  readonly VITE_API_URL: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_API_VERSION?: string;
  
  // WebSocket Configuration
  readonly VITE_WS_URL?: string;
  readonly VITE_WS_RECONNECT_INTERVAL?: string;
  readonly VITE_WS_MAX_RECONNECT_ATTEMPTS?: string;
  
  // Authentication
  readonly VITE_AUTH_TOKEN_KEY?: string;
  readonly VITE_AUTH_REFRESH_TOKEN_KEY?: string;
  readonly VITE_AUTH_PERSIST_KEY?: string;
  
  // Google OAuth
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_REDIRECT_URI?: string;
  
  // Features
  readonly VITE_ENABLE_MFA?: string;
  readonly VITE_ENABLE_OAUTH?: string;
  readonly VITE_ENABLE_WEBSOCKETS?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
  readonly VITE_ENABLE_OFFLINE_MODE?: string;
  
  // Analytics
  readonly VITE_GA_TRACKING_ID?: string;
  readonly VITE_GTM_CONTAINER_ID?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_HOTJAR_ID?: string;
  
  // UI Configuration
  readonly VITE_APP_NAME?: string;
  readonly VITE_APP_TITLE?: string;
  readonly VITE_APP_DESCRIPTION?: string;
  readonly VITE_DEFAULT_THEME?: 'light' | 'dark' | 'system';
  readonly VITE_DEFAULT_LANGUAGE?: string;
  
  // Storage
  readonly VITE_STORAGE_PREFIX?: string;
  readonly VITE_CACHE_TTL?: string;
  
  // Security
  readonly VITE_CSP_NONCE?: string;
  readonly VITE_ENABLE_DEVTOOLS?: string;
  
  // Build Configuration
  readonly VITE_BUILD_VERSION?: string;
  readonly VITE_BUILD_TIMESTAMP?: string;
  readonly VITE_BUILD_COMMIT?: string;
  
  // Environment
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Augment Window interface for runtime config
declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      apiUrl?: string;
      wsUrl?: string;
      features?: Record<string, boolean>;
      [key: string]: any;
    };
  }
}

export {};