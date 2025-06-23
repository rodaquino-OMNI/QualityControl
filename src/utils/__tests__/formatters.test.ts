import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  formatPercentage,
  formatDuration,
} from '../formatters';

describe('formatters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('formatCurrency', () => {
    it('should format positive numbers as Brazilian currency', () => {
      const result = formatCurrency(1234.56);
      // Use a more flexible matcher for currency formatting due to locale differences
      expect(result).toMatch(/R\$\s*1\.234,56/);
    });

    it('should format zero as currency', () => {
      const result = formatCurrency(0);
      expect(result).toMatch(/R\$\s*0,00/);
    });

    it('should format negative numbers as currency', () => {
      const result = formatCurrency(-100.5);
      expect(result).toMatch(/-R\$\s*100,50/);
    });

    it('should handle decimal numbers correctly', () => {
      const result = formatCurrency(99.99);
      expect(result).toMatch(/R\$\s*99,99/);
    });

    it('should handle large numbers', () => {
      const result = formatCurrency(1000000);
      expect(result).toMatch(/R\$\s*1\.000\.000,00/);
    });
  });

  describe('formatDate', () => {
    it('should format Date object', () => {
      const date = new Date('2024-01-01T12:00:00Z');
      const result = formatDate(date);
      // Use a regex to match the expected format without timezone issues
      expect(result).toMatch(/01\/01\/2024 \d{2}:\d{2}/);
    });

    it('should format ISO date string', () => {
      const dateStr = '2024-01-01T12:00:00.000Z';
      const result = formatDate(dateStr);
      // Use a regex to match the expected format without timezone issues
      expect(result).toMatch(/01\/01\/2024 \d{2}:\d{2}/);
    });

    it('should handle invalid date strings gracefully', () => {
      expect(() => formatDate('invalid-date')).toThrow();
    });
  });

  describe('formatRelativeTime', () => {
    it('should format Date object to relative time', () => {
      const date = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const result = formatRelativeTime(date);
      // Just check that it returns a string with time-related words
      expect(result).toMatch(/(ago|in|about|almost|over|less than)/);
    });

    it('should format ISO date string to relative time', () => {
      const dateStr = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 minutes ago
      const result = formatRelativeTime(dateStr);
      // Just check that it returns a string with time-related words
      expect(result).toMatch(/(ago|in|about|almost|over|less than)/);
    });

    it('should handle invalid date strings gracefully', () => {
      expect(() => formatRelativeTime('invalid-date')).toThrow();
    });
  });

  describe('formatPercentage', () => {
    it('should format decimal to percentage with default precision', () => {
      const result = formatPercentage(0.1234);
      expect(result).toBe('12.3%');
    });

    it('should format decimal to percentage with custom precision', () => {
      const result = formatPercentage(0.1234, 2);
      expect(result).toBe('12.34%');
    });

    it('should handle zero percentage', () => {
      const result = formatPercentage(0);
      expect(result).toBe('0.0%');
    });

    it('should handle percentage over 100%', () => {
      const result = formatPercentage(1.5);
      expect(result).toBe('150.0%');
    });

    it('should handle negative percentages', () => {
      const result = formatPercentage(-0.25);
      expect(result).toBe('-25.0%');
    });

    it('should handle zero precision', () => {
      const result = formatPercentage(0.1234, 0);
      expect(result).toBe('12%');
    });
  });

  describe('formatDuration', () => {
    it('should format duration with hours, minutes, and seconds', () => {
      const result = formatDuration(3661); // 1h 1m 1s
      expect(result).toBe('1h 1m 1s');
    });

    it('should format duration with only minutes and seconds', () => {
      const result = formatDuration(61); // 1m 1s
      expect(result).toBe('1m 1s');
    });

    it('should format duration with only seconds', () => {
      const result = formatDuration(30);
      expect(result).toBe('30s');
    });

    it('should handle zero duration', () => {
      const result = formatDuration(0);
      expect(result).toBe('0s');
    });

    it('should handle exact hour', () => {
      const result = formatDuration(3600); // 1h 0m 0s
      expect(result).toBe('1h 0m 0s');
    });

    it('should handle exact minute', () => {
      const result = formatDuration(60); // 1m 0s
      expect(result).toBe('1m 0s');
    });

    it('should handle large durations', () => {
      const result = formatDuration(7323); // 2h 2m 3s
      expect(result).toBe('2h 2m 3s');
    });
  });
});
