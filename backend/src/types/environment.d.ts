// Environment variable type definitions

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      // Node environment
      NODE_ENV: 'development' | 'production' | 'test';
      
      // Server configuration
      PORT: string;
      HOST?: string;
      
      // Database
      DATABASE_URL: string;
      DB_HOST?: string;
      DB_PORT?: string;
      DB_NAME?: string;
      DB_USER?: string;
      DB_PASSWORD?: string;
      DB_SSL?: string;
      
      // Redis
      REDIS_URL?: string;
      REDIS_HOST?: string;
      REDIS_PORT?: string;
      REDIS_PASSWORD?: string;
      REDIS_DB?: string;
      REDIS_TLS?: string;
      
      // Authentication
      JWT_SECRET: string;
      JWT_ACCESS_EXPIRY?: string;
      JWT_REFRESH_EXPIRY?: string;
      BCRYPT_ROUNDS?: string;
      SESSION_SECRET?: string;
      
      // OAuth
      GOOGLE_CLIENT_ID?: string;
      GOOGLE_CLIENT_SECRET?: string;
      GOOGLE_REDIRECT_URI?: string;
      
      // MFA
      MFA_APP_NAME?: string;
      MFA_ISSUER?: string;
      
      // API Keys
      AI_API_KEY?: string;
      AI_API_URL?: string;
      BLOCKCHAIN_API_KEY?: string;
      BLOCKCHAIN_API_URL?: string;
      
      // Email
      SMTP_HOST?: string;
      SMTP_PORT?: string;
      SMTP_USER?: string;
      SMTP_PASSWORD?: string;
      SMTP_FROM?: string;
      SMTP_SECURE?: string;
      
      // Storage
      STORAGE_TYPE?: 'local' | 's3' | 'azure' | 'gcs';
      STORAGE_PATH?: string;
      
      // AWS S3
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
      AWS_REGION?: string;
      S3_BUCKET?: string;
      
      // Azure Blob Storage
      AZURE_STORAGE_CONNECTION_STRING?: string;
      AZURE_STORAGE_CONTAINER?: string;
      
      // Google Cloud Storage
      GCS_PROJECT_ID?: string;
      GCS_BUCKET?: string;
      GCS_KEYFILE?: string;
      
      // Frontend
      FRONTEND_URL: string;
      ALLOWED_ORIGINS?: string;
      
      // Monitoring
      SENTRY_DSN?: string;
      SENTRY_ENVIRONMENT?: string;
      LOG_LEVEL?: string;
      
      // OpenTelemetry
      OTEL_EXPORTER_OTLP_ENDPOINT?: string;
      OTEL_SERVICE_NAME?: string;
      OTEL_TRACES_EXPORTER?: string;
      OTEL_METRICS_EXPORTER?: string;
      
      // Rate limiting
      RATE_LIMIT_WINDOW?: string;
      RATE_LIMIT_MAX?: string;
      
      // Feature flags
      ENABLE_MFA?: string;
      ENABLE_OAUTH?: string;
      ENABLE_WEBHOOKS?: string;
      ENABLE_WEBSOCKETS?: string;
      ENABLE_AI_FEATURES?: string;
      ENABLE_BLOCKCHAIN?: string;
      
      // Queue configuration
      QUEUE_REDIS_URL?: string;
      QUEUE_CONCURRENCY?: string;
      QUEUE_DEFAULT_REMOVE_ON_COMPLETE?: string;
      QUEUE_DEFAULT_REMOVE_ON_FAIL?: string;
      
      // Webhook configuration
      WEBHOOK_TIMEOUT?: string;
      WEBHOOK_MAX_RETRIES?: string;
      WEBHOOK_RETRY_DELAY?: string;
      
      // Security
      CORS_ORIGIN?: string;
      TRUST_PROXY?: string;
      SECURE_COOKIES?: string;
      COOKIE_DOMAIN?: string;
      
      // Maintenance
      MAINTENANCE_MODE?: string;
      MAINTENANCE_MESSAGE?: string;
      
      // Testing
      TEST_DATABASE_URL?: string;
      TEST_REDIS_URL?: string;
    }
  }
}

export {};