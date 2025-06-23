interface LogEntry {
  level: string;
  message: string;
  data?: any;
  timestamp: string;
  url: string;
  userAgent: string;
  sessionId?: string;
}

class FrontendLogger {
  private logLevel: string;
  private sessionId: string;

  constructor() {
    this.logLevel = import.meta.env.VITE_LOG_LEVEL || 'info';
    this.sessionId = this.generateSessionId();
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private createLogEntry(level: string, message: string, data?: any): LogEntry {
    return {
      level,
      message,
      data,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      sessionId: this.sessionId,
    };
  }

  private async sendToBackend(logEntry: LogEntry): Promise<void> {
    try {
      // Only send error and warn logs to backend in production
      if (import.meta.env.PROD && (logEntry.level === 'error' || logEntry.level === 'warn')) {
        await fetch('/api/logs/frontend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(logEntry),
        });
      }
    } catch (error) {
      // Silently fail to avoid logging loops
      console.error('Failed to send log to backend:', error);
    }
  }

  error(message: string, data?: any): void {
    if (!this.shouldLog('error')) return;

    const logEntry = this.createLogEntry('error', message, data);
    console.error(`[${logEntry.timestamp}] ERROR: ${message}`, data);
    this.sendToBackend(logEntry);
  }

  warn(message: string, data?: any): void {
    if (!this.shouldLog('warn')) return;

    const logEntry = this.createLogEntry('warn', message, data);
    console.warn(`[${logEntry.timestamp}] WARN: ${message}`, data);
    this.sendToBackend(logEntry);
  }

  info(message: string, data?: any): void {
    if (!this.shouldLog('info')) return;

    const logEntry = this.createLogEntry('info', message, data);
    console.info(`[${logEntry.timestamp}] INFO: ${message}`, data);
    
    // Don't send info logs to backend by default
    if (import.meta.env.DEV) {
      this.sendToBackend(logEntry);
    }
  }

  debug(message: string, data?: any): void {
    if (!this.shouldLog('debug')) return;

    const logEntry = this.createLogEntry('debug', message, data);
    console.debug(`[${logEntry.timestamp}] DEBUG: ${message}`, data);
  }
}

export const logger = new FrontendLogger();
export default logger;