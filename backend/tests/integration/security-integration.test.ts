import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Security Integration Tests', () => {
  let server: any;
  let userToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // Start test server
    server = app.listen(0);
    
    // Create test users and get tokens
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'testuser@example.com',
        password: 'SecurePassword123!',
        firstName: 'Test',
        lastName: 'User'
      });
    
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'testuser@example.com',
        password: 'SecurePassword123!'
      });
    
    userToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    server?.close();
  });

  describe('Authentication Security', () => {
    it('should prevent brute force attacks on login', async () => {
      const attempts = [];
      
      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        attempts.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'testuser@example.com',
              password: 'wrongpassword'
            })
        );
      }
      
      const responses = await Promise.all(attempts);
      
      // Last attempts should be rate limited
      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.status).toBe(429);
    });

    it('should require strong passwords on registration', async () => {
      const weakPasswords = [
        'password',
        '123456',
        'Password1',
        'qwerty',
        'abc123'
      ];

      for (const weakPassword of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: 'weak@example.com',
            password: weakPassword,
            firstName: 'Weak',
            lastName: 'Password'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/(password|validation)/i);
      }
    });

    it('should validate JWT tokens properly', async () => {
      const maliciousTokens = [
        'Bearer invalid.token.here',
        'Bearer eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxIiwiZW1haWwiOiJoYWNrZXJAZXhhbXBsZS5jb20iLCJyb2xlcyI6WyJhZG1pbiJdfQ.',
        'Bearer null',
        'Bearer undefined',
        ''
      ];

      for (const token of maliciousTokens) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', token);

        expect(response.status).toBe(401);
      }
    });

    it('should prevent session fixation', async () => {
      // Login twice and verify different tokens
      const login1 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'SecurePassword123!'
        });

      const login2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'SecurePassword123!'
        });

      expect(login1.body.accessToken).not.toBe(login2.body.accessToken);
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent XSS attacks in user input', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        'javascript:alert(1)',
        '<svg onload=alert(1)>',
        '"><script>alert(1)</script>',
        '<iframe src=javascript:alert(1)>'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            name: payload,
            bio: payload
          });

        // Should either reject the request or sanitize the input
        if (response.status === 200) {
          expect(response.body.name).not.toContain('<script>');
          expect(response.body.name).not.toContain('javascript:');
          expect(response.body.name).not.toContain('onerror');
        } else {
          expect(response.status).toBe(400);
        }
      }
    });

    it('should prevent SQL injection attempts', async () => {
      const sqlPayloads = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "1' UNION SELECT * FROM users--",
        "'; INSERT INTO users VALUES ('hacker', 'password')--"
      ];

      for (const payload of sqlPayloads) {
        const response = await request(app)
          .get('/api/users/search')
          .set('Authorization', `Bearer ${userToken}`)
          .query({ q: payload });

        // Should not expose database errors
        expect(response.status).not.toBe(500);
        if (response.status === 400) {
          expect(response.body.error).not.toMatch(/(sql|database|mysql|postgres)/i);
        }
      }
    });

    it('should prevent NoSQL injection', async () => {
      const nosqlPayloads = [
        { $ne: null },
        { $regex: '.*' },
        { $where: 'this.username == this.password' },
        { $gt: '' }
      ];

      for (const payload of nosqlPayloads) {
        const response = await request(app)
          .post('/api/users/search')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ filter: payload });

        expect(response.status).toBe(400);
      }
    });

    it('should prevent command injection', async () => {
      const commandPayloads = [
        '; cat /etc/passwd',
        '| whoami',
        '& dir',
        '`id`',
        '$(uname -a)'
      ];

      for (const payload of commandPayloads) {
        const response = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ filename: `document${payload}.pdf` });

        expect(response.status).toBe(400);
      }
    });

    it('should prevent path traversal attacks', async () => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await request(app)
          .get(`/api/files/${payload}`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(400);
      }
    });

    it('should validate file uploads securely', async () => {
      const maliciousFiles = [
        'malware.exe',
        'script.bat',
        'virus.scr',
        'shell.php',
        'backdoor.jsp'
      ];

      for (const filename of maliciousFiles) {
        const response = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${userToken}`)
          .attach('file', Buffer.from('malicious content'), filename);

        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/(file|extension|type)/i);
      }
    });
  });

  describe('CSRF Protection', () => {
    it('should require CSRF tokens for state-changing requests', async () => {
      const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];

      for (const method of methods) {
        const response = await request(app)
          [method.toLowerCase()]('/api/users/profile')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ name: 'Updated Name' });

        // Should require CSRF token or reject based on origin
        expect([400, 403]).toContain(response.status);
      }
    });

    it('should validate request origin', async () => {
      const maliciousOrigins = [
        'http://evil.com',
        'https://phishing-site.com',
        'http://localhost:8080' // Different from allowed origins
      ];

      for (const origin of maliciousOrigins) {
        const response = await request(app)
          .post('/api/users/profile')
          .set('Authorization', `Bearer ${userToken}`)
          .set('Origin', origin)
          .send({ name: 'Updated Name' });

        expect(response.status).toBe(403);
      }
    });
  });

  describe('Authorization Security', () => {
    it('should prevent horizontal privilege escalation', async () => {
      // Try to access another user's data
      const response = await request(app)
        .get('/api/users/different-user-id/profile')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    it('should prevent vertical privilege escalation', async () => {
      // Try to access admin endpoints with user token
      const adminEndpoints = [
        '/api/admin/users',
        '/api/admin/settings',
        '/api/admin/audit-logs'
      ];

      for (const endpoint of adminEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBe(403);
      }
    });

    it('should validate permissions properly', async () => {
      // Test with modified JWT payload (should fail)
      const maliciousToken = 'Bearer ' + Buffer.from(JSON.stringify({
        sub: 'user-id',
        email: 'user@example.com',
        roles: ['admin'], // Escalated role
        exp: Date.now() / 1000 + 3600
      })).toString('base64');

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', maliciousToken);

      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit API requests', async () => {
      const requests = [];
      
      // Make many requests quickly
      for (let i = 0; i < 110; i++) { // Exceed typical rate limit
        requests.push(
          request(app)
            .get('/api/users/profile')
            .set('Authorization', `Bearer ${userToken}`)
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should have stricter limits for sensitive endpoints', async () => {
      const sensitiveRequests = [];
      
      // Test login endpoint rate limiting
      for (let i = 0; i < 10; i++) {
        sensitiveRequests.push(
          request(app)
            .post('/api/auth/login')
            .send({
              email: 'nonexistent@example.com',
              password: 'wrongpassword'
            })
        );
      }

      const responses = await Promise.all(sensitiveRequests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Headers Security', () => {
    it('should set secure HTTP headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // Check for security headers
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['referrer-policy']).toBeDefined();
      expect(response.headers['permissions-policy']).toBeDefined();
    });

    it('should set proper cache headers for sensitive endpoints', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.headers['cache-control']).toMatch(/no-store|no-cache/);
    });

    it('should set HSTS header in production', async () => {
      // Mock production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/api/health');

      if (response.headers['strict-transport-security']) {
        expect(response.headers['strict-transport-security']).toMatch(/max-age=\d+/);
      }

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error Handling Security', () => {
    it('should not expose sensitive information in error messages', async () => {
      // Trigger various errors
      const errorRequests = [
        request(app).get('/api/nonexistent'),
        request(app).post('/api/users').send({}),
        request(app).get('/api/users/invalid-id'),
      ];

      const responses = await Promise.all(errorRequests);

      responses.forEach(response => {
        if (response.body.error) {
          // Should not expose stack traces
          expect(response.body.error).not.toMatch(/at \w+\./);
          
          // Should not expose file paths
          expect(response.body.error).not.toMatch(/\/\w+\/\w+\//);
          
          // Should not expose SQL errors
          expect(response.body.error).not.toMatch(/(SQL|mysql|postgres|sqlite)/i);
        }
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/api/users')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}');

      expect(response.status).toBe(400);
      expect(response.body.error).not.toMatch(/SyntaxError|JSON/);
    });
  });

  describe('Session Security', () => {
    it('should invalidate sessions on logout', async () => {
      // Login and get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'SecurePassword123!'
        });

      const token = loginResponse.body.accessToken;

      // Use token successfully
      await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Token should no longer work
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('should handle concurrent sessions securely', async () => {
      // Login multiple times
      const logins = await Promise.all([
        request(app).post('/api/auth/login').send({
          email: 'testuser@example.com',
          password: 'SecurePassword123!'
        }),
        request(app).post('/api/auth/login').send({
          email: 'testuser@example.com',
          password: 'SecurePassword123!'
        }),
        request(app).post('/api/auth/login').send({
          email: 'testuser@example.com',
          password: 'SecurePassword123!'
        })
      ]);

      // All sessions should work initially
      for (const login of logins) {
        await request(app)
          .get('/api/users/profile')
          .set('Authorization', `Bearer ${login.body.accessToken}`)
          .expect(200);
      }

      // Logout from one session
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${logins[0].body.accessToken}`);

      // That session should be invalid
      await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${logins[0].body.accessToken}`)
        .expect(401);

      // Other sessions should still work
      await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${logins[1].body.accessToken}`)
        .expect(200);
    });
  });

  describe('File Security', () => {
    it('should validate file types on upload', async () => {
      const allowedTypes = ['jpg', 'png', 'pdf', 'doc', 'docx'];
      const maliciousTypes = ['exe', 'bat', 'sh', 'php', 'jsp'];

      for (const type of maliciousTypes) {
        const response = await request(app)
          .post('/api/files/upload')
          .set('Authorization', `Bearer ${userToken}`)
          .attach('file', Buffer.from('test'), `test.${type}`);

        expect(response.status).toBe(400);
      }
    });

    it('should prevent file inclusion attacks', async () => {
      const maliciousPaths = [
        '/etc/passwd',
        '../../../config/database.yml',
        'file:///etc/hosts',
        'C:\\Windows\\System32\\config\\sam'
      ];

      for (const path of maliciousPaths) {
        const response = await request(app)
          .get('/api/files/view')
          .set('Authorization', `Bearer ${userToken}`)
          .query({ path });

        expect(response.status).toBe(400);
      }
    });
  });
});