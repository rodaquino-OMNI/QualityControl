import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

describe('Security Audit Tests', () => {
  describe('Dependency Security', () => {
    it('should not have known vulnerabilities in dependencies', async () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      
      // Check for known vulnerable packages
      const vulnerablePackages = [
        'lodash@4.17.20', // Known prototype pollution
        'axios@0.21.0', // SSRF vulnerability
        'express@4.17.0', // Various vulnerabilities
        'jsonwebtoken@8.5.0', // Algorithm confusion
        'bcrypt@5.0.0', // Timing attacks
      ];

      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      vulnerablePackages.forEach(vuln => {
        const [pkg, version] = vuln.split('@');
        if (dependencies[pkg]) {
          // This is a simplified check - in practice you'd use npm audit or snyk
          expect(dependencies[pkg]).not.toBe(version);
        }
      });
    });

    it('should use secure versions of crypto libraries', async () => {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
      
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Check for secure crypto libraries
      if (dependencies['bcrypt']) {
        expect(dependencies['bcrypt']).toMatch(/\^5\./); // bcrypt 5.x is more secure
      }
      
      if (dependencies['argon2']) {
        expect(dependencies['argon2']).toMatch(/\^0\.(2[8-9]|[3-9])/); // Argon2 0.28+
      }
      
      if (dependencies['jsonwebtoken']) {
        expect(dependencies['jsonwebtoken']).toMatch(/\^9\./); // JWT 9.x has security fixes
      }
    });
  });

  describe('Code Security Scan', () => {
    it('should not contain hardcoded secrets', async () => {
      const secretPatterns = [
        /password\s*=\s*['"][^'"]{8,}['"]/gi,
        /secret\s*=\s*['"][^'"]{16,}['"]/gi,
        /api[_-]?key\s*=\s*['"][^'"]{20,}['"]/gi,
        /token\s*=\s*['"][^'"]{20,}['"]/gi,
        /private[_-]?key\s*=\s*['"][^'"]{50,}['"]/gi,
        /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
        /sk_live_[a-zA-Z0-9]{24,}/gi, // Stripe live keys
        /pk_live_[a-zA-Z0-9]{24,}/gi, // Stripe public keys
        /AKIA[0-9A-Z]{16}/gi, // AWS access keys
        /ghp_[a-zA-Z0-9]{36}/gi, // GitHub personal access tokens
      ];

      const srcDir = path.join(process.cwd(), 'backend', 'src');
      await scanDirectoryForPatterns(srcDir, secretPatterns);
    });

    it('should not use dangerous functions', async () => {
      const dangerousFunctions = [
        /eval\s*\(/gi,
        /Function\s*\(/gi,
        /setTimeout\s*\(\s*['"][^'"]*['"]/gi, // setTimeout with string
        /setInterval\s*\(\s*['"][^'"]*['"]/gi, // setInterval with string
        /execSync\s*\(/gi,
        /spawn\s*\(/gi,
        /exec\s*\(/gi,
        /innerHTML\s*=/gi,
        /document\.write\s*\(/gi,
        /\.html\s*\(/gi, // jQuery .html() can be dangerous
      ];

      const srcDir = path.join(process.cwd(), 'backend', 'src');
      await scanDirectoryForPatterns(srcDir, dangerousFunctions, 'Dangerous function usage found');
    });

    it('should use secure HTTP headers', async () => {
      const securityMiddlewarePath = path.join(process.cwd(), 'backend', 'src', 'middleware', 'security.middleware.ts');
      const content = await readFile(securityMiddlewarePath, 'utf8');

      // Check for essential security headers
      expect(content).toMatch(/X-Frame-Options/);
      expect(content).toMatch(/X-Content-Type-Options/);
      expect(content).toMatch(/X-XSS-Protection/);
      expect(content).toMatch(/Strict-Transport-Security/);
      expect(content).toMatch(/Content-Security-Policy/);
    });

    it('should not have SQL injection vulnerabilities', async () => {
      const sqlPatterns = [
        /\.query\s*\(\s*['"`][^'"]*\$\{[^}]+\}/gi, // Template literals in SQL
        /\.query\s*\(\s*['"`][^'"]*\+/gi, // String concatenation in SQL
        /\.raw\s*\(\s*['"`][^'"]*\$\{[^}]+\}/gi, // Raw queries with template literals
        /\.execute\s*\(\s*['"`][^'"]*\+/gi, // Execute with concatenation
      ];

      const srcDir = path.join(process.cwd(), 'backend', 'src');
      await scanDirectoryForPatterns(srcDir, sqlPatterns, 'Potential SQL injection vulnerability');
    });

    it('should properly validate input', async () => {
      const validationFiles = [
        path.join(process.cwd(), 'backend', 'src', 'middleware', 'validation.middleware.ts'),
        path.join(process.cwd(), 'backend', 'src', 'middleware', 'security.middleware.ts'),
      ];

      for (const file of validationFiles) {
        try {
          const content = await readFile(file, 'utf8');
          
          // Check for input validation
          expect(content).toMatch(/(sanitize|validate|escape)/i);
          
          // Check for XSS prevention
          expect(content).toMatch(/(xss|script|html)/i);
          
        } catch (error) {
          console.warn(`Could not read validation file: ${file}`);
        }
      }
    });
  });

  describe('Configuration Security', () => {
    it('should have secure session configuration', async () => {
      const configFiles = [
        'backend/src/config/auth.config.ts',
        'backend/src/index.ts',
        'backend/src/app.ts',
      ];

      for (const file of configFiles) {
        try {
          const fullPath = path.join(process.cwd(), file);
          const content = await readFile(fullPath, 'utf8');
          
          // Check for secure session settings
          if (content.includes('session')) {
            expect(content).toMatch(/httpOnly.*true/);
            expect(content).toMatch(/secure.*true|secure.*production/);
            expect(content).toMatch(/sameSite/);
          }
        } catch (error) {
          // File might not exist, skip
        }
      }
    });

    it('should not expose sensitive information in errors', async () => {
      const errorHandlerPath = path.join(process.cwd(), 'backend', 'src', 'middleware', 'errorHandler.ts');
      
      try {
        const content = await readFile(errorHandlerPath, 'utf8');
        
        // Should not expose stack traces in production
        expect(content).toMatch(/production.*stack/i);
        
        // Should sanitize error messages
        expect(content).toMatch(/(sanitize|clean|safe)/i);
        
      } catch (error) {
        console.warn('Error handler middleware not found');
      }
    });

    it('should use secure environment variable practices', async () => {
      const envExamplePath = path.join(process.cwd(), '.env.example');
      
      try {
        const content = await readFile(envExamplePath, 'utf8');
        
        // Should not contain actual secrets
        expect(content).not.toMatch(/sk_live_/);
        expect(content).not.toMatch(/AKIA[0-9A-Z]{16}/);
        
        // Should have placeholders for secrets
        expect(content).toMatch(/JWT_SECRET.*=.*your-secret/i);
        expect(content).toMatch(/DATABASE.*=.*your-database/i);
        
      } catch (error) {
        console.warn('.env.example file not found');
      }
    });
  });

  describe('Authentication Security', () => {
    it('should use secure password hashing', async () => {
      const authFiles = [
        'backend/src/services/auth.service.ts',
        'backend/src/utils/password-security.ts',
      ];

      for (const file of authFiles) {
        try {
          const fullPath = path.join(process.cwd(), file);
          const content = await readFile(fullPath, 'utf8');
          
          // Should use Argon2 or bcrypt
          expect(content).toMatch(/(argon2|bcrypt)/i);
          
          // Should not use MD5 or SHA1 for passwords
          expect(content).not.toMatch(/md5|sha1/i);
          
        } catch (error) {
          // File might not exist
        }
      }
    });

    it('should implement proper JWT security', async () => {
      const jwtServicePath = path.join(process.cwd(), 'backend', 'src', 'services', 'jwt.service.ts');
      
      try {
        const content = await readFile(jwtServicePath, 'utf8');
        
        // Should specify algorithm
        expect(content).toMatch(/algorithm|RS256|HS256/i);
        
        // Should have short expiry for access tokens
        expect(content).toMatch(/15m|900|'15 minutes'/);
        
        // Should validate token type
        expect(content).toMatch(/type.*access|refresh/);
        
      } catch (error) {
        console.warn('JWT service not found');
      }
    });
  });

  describe('API Security', () => {
    it('should implement rate limiting', async () => {
      const middlewareFiles = [
        'backend/src/middleware/rateLimiter.ts',
        'backend/src/middleware/auth.middleware.ts',
      ];

      let hasRateLimit = false;
      
      for (const file of middlewareFiles) {
        try {
          const fullPath = path.join(process.cwd(), file);
          const content = await readFile(fullPath, 'utf8');
          
          if (content.includes('rate') && content.includes('limit')) {
            hasRateLimit = true;
            break;
          }
        } catch (error) {
          // File might not exist
        }
      }
      
      expect(hasRateLimit).toBe(true);
    });

    it('should validate request origin', async () => {
      const securityMiddlewarePath = path.join(process.cwd(), 'backend', 'src', 'middleware', 'security.middleware.ts');
      
      try {
        const content = await readFile(securityMiddlewarePath, 'utf8');
        
        // Should check CORS or origin
        expect(content).toMatch(/(cors|origin|referer)/i);
        
      } catch (error) {
        console.warn('Security middleware not found');
      }
    });
  });

  describe('File Security', () => {
    it('should not have files with insecure permissions', async () => {
      const sensitiveFiles = [
        '.env',
        'private.key',
        'server.key',
        'id_rsa',
      ];

      for (const file of sensitiveFiles) {
        try {
          const filePath = path.join(process.cwd(), file);
          const stats = await stat(filePath);
          
          // Check file permissions (should not be world-readable for sensitive files)
          const mode = stats.mode & parseInt('777', 8);
          expect(mode).not.toBe(parseInt('777', 8)); // Should not be world-writable
          expect(mode).not.toBe(parseInt('666', 8)); // Should not be world-writable
          
        } catch (error) {
          // File doesn't exist, which is okay
        }
      }
    });

    it('should not contain backup or temporary files', async () => {
      const dangerousExtensions = [
        '.bak',
        '.backup',
        '.tmp',
        '.temp',
        '.old',
        '.orig',
        '.swp',
        '.DS_Store',
      ];

      const rootDir = process.cwd();
      await checkForDangerousFiles(rootDir, dangerousExtensions);
    });
  });
});

/**
 * Helper function to scan directory for dangerous patterns
 */
async function scanDirectoryForPatterns(
  dir: string, 
  patterns: RegExp[], 
  errorMessage: string = 'Security vulnerability found'
): Promise<void> {
  try {
    const files = await readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await stat(filePath);
      
      if (stats.isDirectory()) {
        await scanDirectoryForPatterns(filePath, patterns, errorMessage);
      } else if (file.endsWith('.ts') || file.endsWith('.js')) {
        const content = await readFile(filePath, 'utf8');
        
        for (const pattern of patterns) {
          const matches = content.match(pattern);
          if (matches) {
            throw new Error(`${errorMessage} in ${filePath}: ${matches[0]}`);
          }
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Helper function to check for dangerous files
 */
async function checkForDangerousFiles(dir: string, extensions: string[]): Promise<void> {
  try {
    const files = await readdir(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await stat(filePath);
      
      if (stats.isDirectory()) {
        // Skip node_modules and .git directories
        if (!file.startsWith('.') && file !== 'node_modules') {
          await checkForDangerousFiles(filePath, extensions);
        }
      } else {
        for (const ext of extensions) {
          if (file.endsWith(ext)) {
            throw new Error(`Dangerous file found: ${filePath}`);
          }
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}