/**
 * Jest Environment Configuration for Integration Tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-integration-testing';
process.env.BCRYPT_ROUNDS = '1'; // Faster hashing for tests

// Database configuration
process.env.DATABASE_TEST_URL = process.env.DATABASE_TEST_URL || 'postgresql://test:test@localhost:5433/austa_test';
process.env.MONGODB_TEST_URL = process.env.MONGODB_TEST_URL || 'mongodb://localhost:27017/austa_test';

// Redis configuration  
process.env.REDIS_TEST_HOST = process.env.REDIS_TEST_HOST || 'localhost';
process.env.REDIS_TEST_PORT = process.env.REDIS_TEST_PORT || '6380';
process.env.REDIS_TEST_PASSWORD = process.env.REDIS_TEST_PASSWORD || '';

// AI Service configuration
process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
process.env.AI_SERVICE_API_KEY = process.env.AI_SERVICE_API_KEY || 'test-ai-api-key';
process.env.AI_SERVICE_TIMEOUT = '5000';

// External API configuration
process.env.MEDICAL_CODES_API_URL = 'http://localhost:8001';
process.env.MEDICAL_CODES_API_KEY = 'test-medical-codes-key';
process.env.INSURANCE_API_URL = 'http://localhost:8002';
process.env.INSURANCE_API_KEY = 'test-insurance-key';

// Application configuration
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.BACKEND_URL = 'http://localhost:3001';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.CSRF_SECRET = 'test-csrf-secret';

// File upload configuration
process.env.UPLOAD_DIR = './test-uploads';
process.env.MAX_FILE_SIZE = '10485760'; // 10MB
process.env.ALLOWED_FILE_TYPES = 'pdf,jpg,jpeg,png,doc,docx';

// Rate limiting configuration
process.env.RATE_LIMIT_WINDOW = '900000'; // 15 minutes
process.env.RATE_LIMIT_MAX = '100';

// Email configuration (mock)
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '1025'; // MailHog test server
process.env.SMTP_USER = 'test';
process.env.SMTP_PASS = 'test';
process.env.FROM_EMAIL = 'test@austa.com';

// Logging configuration
process.env.LOG_LEVEL = 'error'; // Reduce noise in tests
process.env.LOG_FORMAT = 'json';

// Feature flags for testing
process.env.ENABLE_MFA = 'true';
process.env.ENABLE_AUDIT_LOGGING = 'true';
process.env.ENABLE_RATE_LIMITING = 'true';
process.env.ENABLE_CSRF_PROTECTION = 'true';

// Performance configuration
process.env.DB_POOL_MIN = '2';
process.env.DB_POOL_MAX = '10';
process.env.REDIS_POOL_SIZE = '5';

// Security configuration
process.env.BCRYPT_ROUNDS = '1'; // Fast hashing for tests
process.env.JWT_EXPIRES_IN = '1h';
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
process.env.SESSION_EXPIRES_IN = '3600'; // 1 hour

// Test-specific configuration
process.env.CLEANUP_TEST_DATA = 'true';
process.env.SEED_TEST_DATA = 'true';
process.env.PARALLEL_TESTS = 'true';
process.env.TEST_TIMEOUT = '30000';

console.log('✅ Test environment configured for integration tests');