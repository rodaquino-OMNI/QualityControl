# Security Guidelines

This document outlines comprehensive security guidelines, best practices, and procedures for the AUSTA Cockpit platform.

## Table of Contents

1. [Security Overview](#security-overview)
2. [Authentication & Authorization](#authentication--authorization)
3. [Data Protection](#data-protection)
4. [Network Security](#network-security)
5. [Application Security](#application-security)
6. [Infrastructure Security](#infrastructure-security)
7. [Compliance & Auditing](#compliance--auditing)
8. [Incident Response](#incident-response)
9. [Security Development Lifecycle](#security-development-lifecycle)
10. [Vulnerability Management](#vulnerability-management)

## Security Overview

AUSTA Cockpit implements defense-in-depth security architecture with multiple layers of protection to ensure the confidentiality, integrity, and availability of sensitive medical data.

### Security Principles

1. **Zero Trust Architecture**: Never trust, always verify
2. **Principle of Least Privilege**: Minimum necessary access
3. **Defense in Depth**: Multiple security layers
4. **Security by Design**: Security built into every component
5. **Continuous Monitoring**: Real-time threat detection
6. **Data Minimization**: Collect and store only necessary data

### Compliance Standards

- **LGPD** (Lei Geral de Proteção de Dados) - Brazil
- **HIPAA** (Health Insurance Portability and Accountability Act) - US
- **ISO 27001** - Information Security Management
- **SOC 2 Type II** - Security, Availability, and Confidentiality
- **GDPR** - General Data Protection Regulation (when applicable)

## Authentication & Authorization

### Multi-Factor Authentication (MFA)

**Implementation**:
```typescript
// MFA verification service
class MFAService {
  async generateTOTP(userId: string): Promise<MFASetup> {
    const secret = speakeasy.generateSecret({
      name: `AUSTA Cockpit (${user.email})`,
      issuer: 'AUSTA',
      length: 32
    });
    
    await this.storeMFASecret(userId, secret.base32);
    
    return {
      secret: secret.base32,
      qrCode: await QRCode.toDataURL(secret.otpauth_url),
      backupCodes: this.generateBackupCodes()
    };
  }
  
  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    const secret = await this.getMFASecret(userId);
    
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2  // Allow 2 time steps
    });
  }
}
```

**Required for**:
- All user accounts
- Administrative functions
- Sensitive operations
- API access

### Single Sign-On (SSO)

**SAML 2.0 Integration**:
```typescript
// SAML configuration
const samlConfig = {
  entryPoint: process.env.SAML_ENTRY_POINT,
  issuer: 'urn:austa:cockpit',
  cert: fs.readFileSync(process.env.SAML_CERT_PATH, 'utf8'),
  privateCert: fs.readFileSync(process.env.SAML_PRIVATE_KEY_PATH, 'utf8'),
  signatureAlgorithm: 'sha256',
  encryptionAlgorithm: 'http://www.w3.org/2001/04/xmlenc#aes256-cbc',
  digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha256'
};

passport.use(new SamlStrategy(samlConfig, async (profile, done) => {
  try {
    const user = await UserService.findOrCreateFromSAML(profile);
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));
```

### Role-Based Access Control (RBAC)

**Role Definition**:
```typescript
enum UserRole {
  VIEWER = 'viewer',
  AUDITOR = 'auditor',
  SUPERVISOR = 'supervisor',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.VIEWER]: [
    { resource: 'cases', action: 'read' },
    { resource: 'reports', action: 'read' }
  ],
  [UserRole.AUDITOR]: [
    { resource: 'cases', action: 'read' },
    { resource: 'cases', action: 'update', conditions: { assignedTo: 'self' } },
    { resource: 'decisions', action: 'create' },
    { resource: 'ai', action: 'analyze' }
  ],
  [UserRole.SUPERVISOR]: [
    { resource: 'cases', action: '*' },
    { resource: 'decisions', action: '*' },
    { resource: 'users', action: 'read' },
    { resource: 'analytics', action: 'read' }
  ],
  [UserRole.ADMIN]: [
    { resource: '*', action: '*' }
  ]
};
```

### JWT Token Security

**Token Configuration**:
```typescript
const jwtConfig = {
  accessToken: {
    expiresIn: '15m',
    algorithm: 'RS256',
    issuer: 'austa-cockpit',
    audience: 'austa-users'
  },
  refreshToken: {
    expiresIn: '7d',
    algorithm: 'HS256'
  }
};

// Token validation middleware
const validateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = extractTokenFromHeader(req);
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: jwtConfig.accessToken.issuer,
      audience: jwtConfig.accessToken.audience
    });
    
    // Check token blacklist
    if (await TokenBlacklist.isBlacklisted(token)) {
      throw new Error('Token has been revoked');
    }
    
    req.user = await UserService.findById(payload.userId);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
```

## Data Protection

### Encryption at Rest

**Database Encryption**:
```sql
-- PostgreSQL configuration
ALTER SYSTEM SET ssl = 'on';
ALTER SYSTEM SET ssl_cert_file = '/path/to/server.crt';
ALTER SYSTEM SET ssl_key_file = '/path/to/server.key';
ALTER SYSTEM SET ssl_ciphers = 'ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256';

-- Transparent Data Encryption for sensitive columns
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt sensitive fields
CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    cpf BYTEA NOT NULL, -- Encrypted CPF
    medical_record BYTEA, -- Encrypted medical record number
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert with encryption
INSERT INTO patients (name, cpf, medical_record)
VALUES (
    'João Silva',
    pgp_sym_encrypt('12345678901', :encryption_key),
    pgp_sym_encrypt('MR123456', :encryption_key)
);
```

**File Storage Encryption**:
```typescript
// S3 encryption configuration
const s3Config = {
  region: process.env.AWS_REGION,
  sslEnabled: true,
  s3ForcePathStyle: false,
  serverSideEncryption: 'AES256',
  sseKMSKeyId: process.env.KMS_KEY_ID
};

// Upload encrypted file
const uploadFile = async (file: Buffer, key: string): Promise<string> => {
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Body: file,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: process.env.KMS_KEY_ID,
    ContentType: 'application/octet-stream'
  };
  
  const result = await s3.upload(params).promise();
  return result.Location;
};
```

### Encryption in Transit

**TLS Configuration**:
```nginx
# Nginx SSL configuration
server {
    listen 443 ssl http2;
    server_name cockpit.austa.com.br;
    
    # SSL certificates
    ssl_certificate /etc/ssl/certs/cockpit.austa.com.br.crt;
    ssl_certificate_key /etc/ssl/private/cockpit.austa.com.br.key;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    
    # OCSP stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/ssl/certs/chain.crt;
    
    # Session settings
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
}
```

### Data Masking and Anonymization

**Data Masking Service**:
```typescript
class DataMaskingService {
  static maskCPF(cpf: string): string {
    return cpf.replace(/(\d{3})\d{3}(\d{3})/, '$1***$2');
  }
  
  static maskEmail(email: string): string {
    const [username, domain] = email.split('@');
    const maskedUsername = username.substring(0, 2) + '*'.repeat(username.length - 2);
    return `${maskedUsername}@${domain}`;
  }
  
  static maskMedicalRecord(record: string): string {
    return record.substring(0, 2) + '*'.repeat(record.length - 4) + record.slice(-2);
  }
  
  // Anonymize data for analytics
  static anonymizePatientData(data: PatientData): AnonymizedPatientData {
    return {
      ...data,
      name: null,
      cpf: null,
      dateOfBirth: this.fuzzyDate(data.dateOfBirth),
      zipCode: data.zipCode?.substring(0, 5) + 'XX'
    };
  }
}
```

### Personal Data Handling

**LGPD Compliance**:
```typescript
// Data retention policy
enum DataRetentionPeriod {
  ACTIVE_CASES = 30, // days
  COMPLETED_CASES = 2555, // 7 years in days
  AUDIT_LOGS = 1095, // 3 years
  BACKUP_DATA = 365 // 1 year
}

class DataRetentionService {
  async cleanupExpiredData(): Promise<void> {
    // Remove personal data from completed cases
    await this.anonymizeCompletedCases();
    
    // Delete expired audit logs
    await this.deleteExpiredAuditLogs();
    
    // Clean up temporary files
    await this.cleanupTempFiles();
  }
  
  // Right to be forgotten (LGPD Article 18)
  async deleteUserData(userId: string, reason: string): Promise<void> {
    const user = await UserService.findById(userId);
    
    // Log the deletion request
    await AuditLog.create({
      action: 'DATA_DELETION',
      userId: userId,
      reason: reason,
      timestamp: new Date()
    });
    
    // Anonymize instead of delete to maintain referential integrity
    await this.anonymizeUserData(userId);
    
    // Remove from active systems
    await this.removeFromActiveSystems(userId);
  }
}
```

## Network Security

### Web Application Firewall (WAF)

**AWS WAF Configuration**:
```json
{
  "Name": "AustaCockpitWAF",
  "Rules": [
    {
      "Name": "SQLInjectionRule",
      "Priority": 1,
      "Action": { "Block": {} },
      "Statement": {
        "SqliMatchStatement": {
          "FieldToMatch": {
            "Body": {}
          },
          "TextTransformations": [
            {
              "Priority": 0,
              "Type": "URL_DECODE"
            },
            {
              "Priority": 1,
              "Type": "HTML_ENTITY_DECODE"
            }
          ]
        }
      }
    },
    {
      "Name": "XSSRule",
      "Priority": 2,
      "Action": { "Block": {} },
      "Statement": {
        "XssMatchStatement": {
          "FieldToMatch": {
            "AllQueryArguments": {}
          },
          "TextTransformations": [
            {
              "Priority": 0,
              "Type": "URL_DECODE"
            }
          ]
        }
      }
    },
    {
      "Name": "RateLimitRule",
      "Priority": 3,
      "Action": { "Block": {} },
      "Statement": {
        "RateBasedStatement": {
          "Limit": 2000,
          "AggregateKeyType": "IP"
        }
      }
    }
  ]
}
```

### API Rate Limiting

**Rate Limiting Implementation**:
```typescript
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

// Different limits for different endpoints
const createRateLimiter = (windowMs: number, max: number) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: 'Too many requests',
      retryAfter: windowMs / 1000
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path
      });
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Apply different limits
app.use('/api/auth/login', createRateLimiter(15 * 60 * 1000, 5)); // 5 attempts per 15 minutes
app.use('/api/v1', createRateLimiter(15 * 60 * 1000, 1000)); // 1000 requests per 15 minutes
app.use('/api/v1/ai', createRateLimiter(60 * 1000, 10)); // 10 AI requests per minute

// Slow down repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 100,
  delayMs: 500
});

app.use('/api/v1', speedLimiter);
```

### DDoS Protection

**Cloudflare Configuration**:
```javascript
// Cloudflare security settings
const cloudflareConfig = {
  securityLevel: 'high',
  challengePassage: 'captcha',
  browserIntegrityCheck: true,
  hotlinkProtection: true,
  serverSideExcludes: true,
  securityHeader: true,
  ipGeolocation: {
    allowedCountries: ['BR', 'US', 'CA'], // Restrict to specific countries
    blockedCountries: [] // Add countries to block
  },
  rateLimiting: {
    threshold: 1000, // requests per minute
    period: 60,
    action: 'challenge'
  }
};
```

## Application Security

### Input Validation and Sanitization

**Validation Schema**:
```typescript
import { z } from 'zod';

// Input validation schemas
const CaseSchema = z.object({
  patientId: z.string().uuid(),
  procedureCode: z.string().regex(/^\d{8}$/), // TUSS code format
  requestedValue: z.number().positive().max(999999.99),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  notes: z.string().max(1000).optional()
});

const AuthSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
});

// Validation middleware
const validateInput = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors
        });
      }
      next(error);
    }
  };
};
```

### SQL Injection Prevention

**Parameterized Queries with Prisma**:
```typescript
// Safe database queries using Prisma
class CaseService {
  static async findCases(filters: CaseFilters): Promise<Case[]> {
    return await prisma.case.findMany({
      where: {
        status: filters.status,
        priority: filters.priority,
        assignedTo: filters.assignedTo,
        createdAt: {
          gte: filters.startDate,
          lte: filters.endDate
        }
      },
      include: {
        patient: {
          select: {
            id: true,
            name: true,
            // Never include sensitive fields in queries
          }
        },
        decisions: true
      }
    });
  }
  
  // Never use raw SQL unless absolutely necessary
  static async getStatistics(): Promise<Statistics> {
    const result = await prisma.$queryRaw`
      SELECT 
        status,
        COUNT(*) as count
      FROM cases 
      WHERE created_at >= ${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
      GROUP BY status
    `;
    
    return result;
  }
}
```

### Cross-Site Scripting (XSS) Prevention

**Content Security Policy**:
```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.austa.com.br"],
      mediaSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true
}));
```

### CSRF Protection

**CSRF Token Implementation**:
```typescript
import csrf from 'csurf';

// CSRF protection for state-changing operations
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

// Apply CSRF protection to forms and API endpoints
app.use('/api/v1/cases', csrfProtection);
app.use('/api/v1/decisions', csrfProtection);

// Provide CSRF token to frontend
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});
```

## Infrastructure Security

### Container Security

**Dockerfile Security Best Practices**:
```dockerfile
# Use official, minimal base images
FROM node:20-alpine AS base

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Set security-focused labels
LABEL security.scanning="enabled"
LABEL security.team="devops@austa.com.br"

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --chown=nextjs:nodejs . .

# Remove unnecessary files
RUN rm -rf .git .gitignore README.md docs/

# Use non-root user
USER nextjs

# Set read-only filesystem
RUN chmod -R 755 /app

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/index.js"]
```

**Container Scanning**:
```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on: [push, pull_request]

jobs:
  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build image
        run: docker build -t austa/cockpit:test .
        
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'austa/cockpit:test'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          
      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

### Kubernetes Security

**Pod Security Standards**:
```yaml
# pod-security-policy.yaml
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
  annotations:
    seccomp.security.alpha.kubernetes.io/pod: runtime/default
spec:
  serviceAccountName: limited-sa
  securityContext:
    runAsNonRoot: true
    runAsUser: 1001
    runAsGroup: 1001
    fsGroup: 1001
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: austa/cockpit:latest
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
        - ALL
      runAsNonRoot: true
      runAsUser: 1001
    resources:
      limits:
        memory: "1Gi"
        cpu: "1000m"
      requests:
        memory: "512Mi"
        cpu: "500m"
    volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: cache
      mountPath: /app/cache
  volumes:
  - name: tmp
    emptyDir: {}
  - name: cache
    emptyDir: {}
```

**Network Policies**:
```yaml
# network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-default
  namespace: austa-system
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-to-db
  namespace: austa-system
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: database
    ports:
    - protocol: TCP
      port: 5432
```

### Secrets Management

**HashiCorp Vault Integration**:
```typescript
import * as vault from 'node-vault';

class SecretsService {
  private vault: any;
  
  constructor() {
    this.vault = vault({
      apiVersion: 'v1',
      endpoint: process.env.VAULT_ENDPOINT,
      token: process.env.VAULT_TOKEN
    });
  }
  
  async getSecret(path: string): Promise<any> {
    try {
      const result = await this.vault.read(path);
      return result.data;
    } catch (error) {
      logger.error('Failed to retrieve secret', { path, error });
      throw new Error('Secret retrieval failed');
    }
  }
  
  async rotateSecret(path: string, newValue: any): Promise<void> {
    await this.vault.write(path, newValue);
    
    // Trigger application restart to pick up new secrets
    await this.notifyApplicationRestart();
  }
  
  // Automatic secret rotation
  async setupSecretRotation(): Promise<void> {
    const schedule = '0 2 * * 0'; // Every Sunday at 2 AM
    
    cron.schedule(schedule, async () => {
      await this.rotateSecret('database/password', this.generatePassword());
      await this.rotateSecret('api/jwt-secret', this.generateJWTSecret());
    });
  }
}
```

## Compliance & Auditing

### Audit Logging

**Comprehensive Audit Trail**:
```typescript
enum AuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  CASE_VIEW = 'CASE_VIEW',
  CASE_UPDATE = 'CASE_UPDATE',
  DECISION_CREATE = 'DECISION_CREATE',
  DATA_EXPORT = 'DATA_EXPORT',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  USER_CREATE = 'USER_CREATE',
  USER_DELETE = 'USER_DELETE',
  PERMISSION_CHANGE = 'PERMISSION_CHANGE'
}

interface AuditEntry {
  id: string;
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  sessionId: string;
  success: boolean;
  errorMessage?: string;
}

class AuditService {
  static async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry: AuditEntry = {
      ...entry,
      id: uuid(),
      timestamp: new Date()
    };
    
    // Store in database
    await prisma.auditLog.create({ data: auditEntry });
    
    // Send to SIEM system
    await this.sendToSIEM(auditEntry);
    
    // Check for suspicious patterns
    await this.detectAnomalies(auditEntry);
  }
  
  // Audit middleware for API endpoints
  static auditMiddleware(action: AuditAction, resource: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      
      res.on('finish', async () => {
        await AuditService.log({
          userId: req.user?.id || 'anonymous',
          action,
          resource,
          resourceId: req.params.id,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
            statusCode: res.statusCode,
            responseTime: Date.now() - startTime
          },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || '',
          sessionId: req.sessionID,
          success: res.statusCode < 400
        });
      });
      
      next();
    };
  }
}
```

### Data Retention and Deletion

**LGPD Compliance**:
```typescript
class DataGovernanceService {
  async enforceRetentionPolicies(): Promise<void> {
    const policies = await this.getRetentionPolicies();
    
    for (const policy of policies) {
      await this.processRetentionPolicy(policy);
    }
  }
  
  async processRetentionPolicy(policy: RetentionPolicy): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);
    
    switch (policy.action) {
      case 'DELETE':
        await this.deleteExpiredData(policy.dataType, cutoffDate);
        break;
      case 'ANONYMIZE':
        await this.anonymizeExpiredData(policy.dataType, cutoffDate);
        break;
      case 'ARCHIVE':
        await this.archiveExpiredData(policy.dataType, cutoffDate);
        break;
    }
  }
  
  // Handle data subject requests (LGPD Article 18)
  async handleDataSubjectRequest(request: DataSubjectRequest): Promise<void> {
    switch (request.type) {
      case 'ACCESS':
        await this.exportUserData(request.userId);
        break;
      case 'RECTIFICATION':
        await this.rectifyUserData(request.userId, request.corrections);
        break;
      case 'DELETION':
        await this.deleteUserData(request.userId);
        break;
      case 'PORTABILITY':
        await this.portUserData(request.userId, request.format);
        break;
    }
  }
}
```

## Incident Response

### Security Incident Response Plan

**Incident Classification**:
```typescript
enum IncidentSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

enum IncidentType {
  DATA_BREACH = 'data_breach',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  MALWARE = 'malware',
  DDOS = 'ddos',
  INSIDER_THREAT = 'insider_threat',
  SYSTEM_COMPROMISE = 'system_compromise'
}

interface SecurityIncident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  detectedAt: Date;
  detectionMethod: string;
  affectedSystems: string[];
  affectedUsers: string[];
  containmentActions: string[];
  status: 'open' | 'investigating' | 'contained' | 'resolved';
  assignedTo: string;
  escalatedTo?: string;
  communicationLog: CommunicationEntry[];
}

class IncidentResponseService {
  async reportIncident(incident: Partial<SecurityIncident>): Promise<string> {
    const incidentId = uuid();
    
    const fullIncident: SecurityIncident = {
      ...incident,
      id: incidentId,
      detectedAt: new Date(),
      status: 'open',
      communicationLog: []
    };
    
    // Immediate containment for critical incidents
    if (incident.severity === IncidentSeverity.CRITICAL) {
      await this.activateEmergencyProtocols(fullIncident);
    }
    
    // Notify incident response team
    await this.notifyIncidentTeam(fullIncident);
    
    // Start investigation workflow
    await this.startInvestigation(fullIncident);
    
    return incidentId;
  }
  
  async activateEmergencyProtocols(incident: SecurityIncident): Promise<void> {
    // Isolate affected systems
    await this.isolateAffectedSystems(incident.affectedSystems);
    
    // Revoke potentially compromised credentials
    await this.revokeCompromisedCredentials(incident.affectedUsers);
    
    // Enable enhanced monitoring
    await this.enableEnhancedMonitoring();
    
    // Notify executives and legal team
    await this.notifyExecutives(incident);
  }
}
```

### Automated Threat Detection

**SIEM Integration**:
```typescript
class ThreatDetectionService {
  async analyzeSecurityEvents(): Promise<void> {
    const events = await this.getRecentSecurityEvents();
    
    for (const event of events) {
      const riskScore = await this.calculateRiskScore(event);
      
      if (riskScore > 0.8) {
        await this.createSecurityAlert(event, riskScore);
      }
    }
  }
  
  async calculateRiskScore(event: SecurityEvent): Promise<number> {
    let score = 0;
    
    // Failed login attempts
    if (event.type === 'login_failure') {
      const recentFailures = await this.getRecentFailedLogins(event.userId, '15m');
      score += Math.min(recentFailures.length * 0.2, 0.8);
    }
    
    // Unusual access patterns
    if (event.type === 'data_access') {
      const isUnusualTime = this.isUnusualAccessTime(event.timestamp);
      const isUnusualLocation = await this.isUnusualLocation(event.ipAddress, event.userId);
      
      if (isUnusualTime) score += 0.3;
      if (isUnusualLocation) score += 0.5;
    }
    
    // Privilege escalation
    if (event.type === 'permission_change') {
      score += 0.6;
    }
    
    return Math.min(score, 1.0);
  }
  
  async detectAnomalies(): Promise<void> {
    // Use machine learning for anomaly detection
    const model = await this.loadAnomalyDetectionModel();
    const userBehavior = await this.getUserBehaviorData();
    
    const anomalies = model.predict(userBehavior);
    
    for (const anomaly of anomalies) {
      if (anomaly.score > 0.9) {
        await this.createAnomalyAlert(anomaly);
      }
    }
  }
}
```

## Security Development Lifecycle

### Secure Coding Guidelines

**Code Review Checklist**:
```markdown
## Security Code Review Checklist

### Authentication & Authorization
- [ ] All endpoints require proper authentication
- [ ] Authorization checks are implemented for each action
- [ ] JWT tokens are properly validated
- [ ] Session management is secure

### Input Validation
- [ ] All user inputs are validated and sanitized
- [ ] SQL injection prevention measures are in place
- [ ] XSS prevention is implemented
- [ ] File upload validation is secure

### Data Protection
- [ ] Sensitive data is encrypted at rest
- [ ] Personal data is properly masked/anonymized
- [ ] Encryption keys are securely managed
- [ ] Data retention policies are followed

### Error Handling
- [ ] Error messages don't expose sensitive information
- [ ] Proper logging is implemented
- [ ] Security events are logged
- [ ] Stack traces are not exposed to users

### Dependencies
- [ ] All dependencies are up to date
- [ ] Known vulnerabilities are addressed
- [ ] Dependency scanning is enabled
- [ ] Only necessary dependencies are included
```

### Security Testing

**Automated Security Tests**:
```typescript
// Security test suite
describe('Security Tests', () => {
  describe('Authentication', () => {
    it('should reject requests without valid JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/cases')
        .expect(401);
      
      expect(response.body.error).toBe('Authentication required');
    });
    
    it('should prevent brute force attacks', async () => {
      const invalidCredentials = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };
      
      // Try 6 failed logins
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/auth/login')
          .send(invalidCredentials)
          .expect(401);
      }
      
      // 7th attempt should be rate limited
      await request(app)
        .post('/api/auth/login')
        .send(invalidCredentials)
        .expect(429);
    });
  });
  
  describe('Input Validation', () => {
    it('should prevent SQL injection', async () => {
      const maliciousInput = "'; DROP TABLE users; --";
      
      const response = await request(app)
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          patientId: maliciousInput,
          procedureCode: '12345678'
        })
        .expect(400);
      
      expect(response.body.error).toBe('Validation failed');
    });
    
    it('should prevent XSS attacks', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const response = await request(app)
        .post('/api/v1/cases')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          patientId: validUUID,
          notes: xssPayload
        })
        .expect(400);
    });
  });
});
```

## Vulnerability Management

### Dependency Scanning

**Automated Vulnerability Scanning**:
```yaml
# .github/workflows/security-scan.yml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
          
      - name: Run npm audit
        run: npm audit --audit-level=high
        
      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'austa-cockpit'
          path: '.'
          format: 'JSON'
          
  container-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker image
        run: docker build -t austa/cockpit:latest .
        
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'austa/cockpit:latest'
          format: 'sarif'
          output: 'trivy-results.sarif'
          
      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'
```

### Penetration Testing

**Regular Security Assessments**:
```bash
#!/bin/bash
# automated-pentest.sh

# OWASP ZAP automated scan
docker run -v $(pwd):/zap/wrk/:rw \
  -t owasp/zap2docker-stable zap-baseline.py \
  -t https://staging.austa.com.br \
  -J zap-report.json

# Nuclei vulnerability scanner
nuclei -u https://staging.austa.com.br \
  -t nuclei-templates/ \
  -o nuclei-report.txt

# Custom security tests
python3 security-tests/run_tests.py \
  --target https://staging.austa.com.br \
  --output security-report.json
```

### Security Monitoring

**Real-time Security Monitoring**:
```typescript
class SecurityMonitoringService {
  async monitorSecurityMetrics(): Promise<void> {
    // Monitor failed login attempts
    const failedLogins = await this.getFailedLoginCount('1h');
    if (failedLogins > 100) {
      await this.alertSecurityTeam('High number of failed logins detected');
    }
    
    // Monitor unusual API usage
    const apiUsage = await this.getAPIUsagePattern();
    if (this.isAnomalousUsage(apiUsage)) {
      await this.alertSecurityTeam('Anomalous API usage detected');
    }
    
    // Monitor privilege escalations
    const privilegeChanges = await this.getRecentPrivilegeChanges();
    if (privilegeChanges.length > 0) {
      await this.alertSecurityTeam('Privilege escalations detected');
    }
  }
  
  async checkSecurityHealth(): Promise<SecurityHealthReport> {
    return {
      certificateExpiry: await this.checkCertificateExpiry(),
      vulnerabilityCount: await this.getKnownVulnerabilities(),
      securityPatchStatus: await this.getSecurityPatchStatus(),
      authenticationHealth: await this.checkAuthenticationHealth(),
      encryptionStatus: await this.checkEncryptionStatus()
    };
  }
}
```

## Security Contacts

**Security Team Contacts**:
- **Security Officer**: security@austa.com.br
- **Incident Response**: incident-response@austa.com.br
- **Vulnerability Reports**: security-reports@austa.com.br
- **Emergency Hotline**: +55 11 9999-9999

**Reporting Security Issues**:
1. Email security-reports@austa.com.br
2. Use our responsible disclosure policy
3. Include detailed steps to reproduce
4. Provide impact assessment
5. Allow 90 days for resolution before public disclosure