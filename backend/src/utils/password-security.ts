import crypto from 'crypto';
import argon2 from 'argon2';

/**
 * Password security utilities
 */
export class PasswordSecurity {
  // Minimum security requirements
  private static readonly MIN_LENGTH = 12;
  private static readonly MIN_ENTROPY = 50; // bits
  private static readonly ARGON2_MEMORY_COST = 65536; // 64 MB
  private static readonly ARGON2_TIME_COST = 3;
  private static readonly ARGON2_PARALLELISM = 4;

  // Common weak passwords to reject
  private static readonly WEAK_PASSWORDS = new Set([
    'password', 'password123', '123456', '123456789', 'qwerty', 'abc123',
    'password1', 'admin', 'user', 'guest', 'test', 'demo', 'letmein',
    'welcome', 'monkey', 'dragon', 'master', 'shadow', 'superman',
    'michael', 'jesus', 'ninja', 'mustang', 'football', 'baseball',
    'princess', 'bailey', 'access', 'flower', 'starwars', 'summer',
    'charlie', 'jordan', 'hunter', 'computer', 'freedom', 'eagles'
  ]);

  // Common patterns to avoid
  private static readonly WEAK_PATTERNS = [
    /^(.)\1+$/, // Repeated characters (aaaa, 1111)
    /^(012|123|234|345|456|567|678|789|890|987|876|765|654|543|432|321|210)/, // Sequential
    /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i, // Alphabetical
    /^(qwe|wer|ert|rty|tyu|yui|uio|iop|asd|sdf|dfg|fgh|ghj|hjk|jkl|zxc|xcv|cvb|vbn|bnm)/i, // Keyboard patterns
  ];

  /**
   * Validate password strength
   */
  static validatePassword(password: string): {
    isValid: boolean;
    errors: string[];
    strength: 'weak' | 'fair' | 'good' | 'strong';
    entropy: number;
  } {
    const errors: string[] = [];
    
    // Check minimum length
    if (password.length < this.MIN_LENGTH) {
      errors.push(`Password must be at least ${this.MIN_LENGTH} characters long`);
    }

    // Check maximum length (prevent DoS)
    if (password.length > 128) {
      errors.push('Password must not exceed 128 characters');
    }

    // Check for required character types
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);

    let characterTypeCount = 0;
    if (hasLowercase) characterTypeCount++;
    if (hasUppercase) characterTypeCount++;
    if (hasNumbers) characterTypeCount++;
    if (hasSpecialChars) characterTypeCount++;

    if (characterTypeCount < 3) {
      errors.push('Password must contain at least 3 of the following: lowercase letters, uppercase letters, numbers, special characters');
    }

    // Check for common weak passwords
    if (this.WEAK_PASSWORDS.has(password.toLowerCase())) {
      errors.push('Password is too common and easily guessable');
    }

    // Check for weak patterns
    for (const pattern of this.WEAK_PATTERNS) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns and is easily guessable');
        break;
      }
    }

    // Check for personal information patterns (basic check)
    if (this.containsPersonalInfo(password)) {
      errors.push('Password should not contain obvious personal information');
    }

    // Calculate entropy
    const entropy = this.calculateEntropy(password);
    if (entropy < this.MIN_ENTROPY) {
      errors.push(`Password entropy is too low (${entropy.toFixed(1)} bits, minimum ${this.MIN_ENTROPY} bits)`);
    }

    // Determine strength
    let strength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
    if (errors.length === 0) {
      if (entropy >= 80 && password.length >= 16) {
        strength = 'strong';
      } else if (entropy >= 65 && password.length >= 14) {
        strength = 'good';
      } else {
        strength = 'fair';
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength,
      entropy
    };
  }

  /**
   * Calculate password entropy
   */
  private static calculateEntropy(password: string): number {
    let characterSpace = 0;
    
    if (/[a-z]/.test(password)) characterSpace += 26;
    if (/[A-Z]/.test(password)) characterSpace += 26;
    if (/\d/.test(password)) characterSpace += 10;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) characterSpace += 32;
    if (/[^\w\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)) characterSpace += 32; // Other Unicode

    return Math.log2(Math.pow(characterSpace, password.length));
  }

  /**
   * Check for basic personal information patterns
   */
  private static containsPersonalInfo(password: string): boolean {
    const lower = password.toLowerCase();
    
    // Check for common personal info patterns
    const personalPatterns = [
      /\b(admin|user|test|demo|guest)\b/,
      /\b(name|email|phone|address)\b/,
      /\b(birth|birthday|age)\b/,
      /\b(company|work|office)\b/,
      /\b(family|wife|husband|son|daughter)\b/,
      /\b\d{4}\b/, // Years
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    ];

    return personalPatterns.some(pattern => pattern.test(lower));
  }

  /**
   * Hash password with Argon2id
   */
  static async hashPassword(password: string): Promise<string> {
    // Validate password before hashing
    const validation = this.validatePassword(password);
    if (!validation.isValid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    try {
      return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: this.ARGON2_MEMORY_COST,
        timeCost: this.ARGON2_TIME_COST,
        parallelism: this.ARGON2_PARALLELISM,
        salt: crypto.randomBytes(32)
      });
    } catch (error) {
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      // Log the error but don't expose details
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Generate secure random password
   */
  static generateSecurePassword(length: number = 16): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    const allChars = lowercase + uppercase + numbers + symbols;
    let password = '';
    
    // Ensure at least one character from each category
    password += this.getRandomChar(lowercase);
    password += this.getRandomChar(uppercase);
    password += this.getRandomChar(numbers);
    password += this.getRandomChar(symbols);
    
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += this.getRandomChar(allChars);
    }
    
    // Shuffle the password to avoid predictable patterns
    return this.shuffleString(password);
  }

  /**
   * Get random character from string
   */
  private static getRandomChar(str: string): string {
    const randomIndex = crypto.randomInt(0, str.length);
    return str[randomIndex];
  }

  /**
   * Shuffle string characters
   */
  private static shuffleString(str: string): string {
    const arr = str.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
  }

  /**
   * Check if password has been compromised (would require external service)
   */
  static async isPasswordCompromised(password: string): Promise<boolean> {
    // This would typically check against HaveIBeenPwned API
    // For now, just check against our weak password list
    return this.WEAK_PASSWORDS.has(password.toLowerCase());
  }

  /**
   * Rate limit password attempts by IP/user
   */
  static shouldRateLimitPassword(attempts: number, timeWindow: number): boolean {
    // More than 5 attempts in 15 minutes should be rate limited
    return attempts > 5 && timeWindow < 15 * 60 * 1000;
  }
}