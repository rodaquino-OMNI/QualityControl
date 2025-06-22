import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig, AxiosError } from 'axios';
import { logger } from '../utils/logger';

// Circuit breaker states
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

// Error classification
interface ClassifiedError {
  isRetryable: boolean;
  isClientError: boolean;
  isServerError: boolean;
  isNetworkError: boolean;
  userMessage: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Circuit breaker configuration
interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

// Retry configuration
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
}

class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
        logger.info('Circuit breaker moving to HALF_OPEN state');
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= 3) {
        this.state = CircuitState.CLOSED;
        logger.info('Circuit breaker closed - service recovered');
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.warn(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

class ApiService {
  private api: AxiosInstance;
  private circuitBreaker: CircuitBreaker;
  private retryConfig: RetryConfig;

  constructor() {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      monitoringPeriod: 60000, // 1 minute
    });

    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      retryableStatusCodes: [408, 429, 502, 503, 504],
    };

    this.api = axios.create({
      baseURL: import.meta.env.VITE_API_URL || '/api',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.api.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('authToken') || localStorage.getItem('accessToken');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        // Add correlation ID for request tracking
        const correlationId = this.generateCorrelationId();
        if (config.headers) {
          config.headers['X-Correlation-ID'] = correlationId;
        }

        logger.debug('API Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          correlationId,
        });

        return config;
      },
      (error: unknown) => {
        logger.error('Request interceptor error', { error: (error as Error).message });
        return Promise.reject(this.enhanceError(error as AxiosError));
      }
    );

    // Response interceptor with enhanced error handling
    this.api.interceptors.response.use(
      (response: AxiosResponse) => {
        logger.debug('API Response Success', {
          status: response.status,
          url: response.config.url,
          correlationId: response.headers['x-correlation-id'],
        });
        return response;
      },
      async (error: AxiosError) => {
        const enhancedError = this.enhanceError(error);
        
        logger.error('API Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          correlationId: error.response?.headers['x-correlation-id'],
        });

        // Handle specific error cases
        if (error.response?.status === 401) {
          await this.handleUnauthorized();
        } else if (error.response?.status === 403) {
          this.handleForbidden();
        } else if (error.response?.status && error.response.status >= 500) {
          this.handleServerError(error);
        }

        return Promise.reject(enhancedError);
      }
    );
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private enhanceError(error: AxiosError): ClassifiedError & AxiosError {
    const classified = this.classifyError(error);
    
    return {
      ...error,
      ...classified,
    };
  }

  private classifyError(error: AxiosError): ClassifiedError {
    const status = error.response?.status;
    const code = error.code;

    // Network errors
    if (!status || code === 'NETWORK_ERROR' || code === 'ECONNABORTED') {
      return {
        isRetryable: true,
        isClientError: false,
        isServerError: false,
        isNetworkError: true,
        userMessage: 'Network connection error. Please check your internet connection and try again.',
        severity: 'medium',
      };
    }

    // Timeout errors
    if (code === 'ECONNABORTED' || status === 408) {
      return {
        isRetryable: true,
        isClientError: false,
        isServerError: false,
        isNetworkError: false,
        userMessage: 'Request timed out. Please try again.',
        severity: 'medium',
      };
    }

    // Client errors (4xx)
    if (status >= 400 && status < 500) {
      const userMessages: Record<number, string> = {
        400: 'Invalid request. Please check your input and try again.',
        401: 'Authentication required. Please log in and try again.',
        403: 'You do not have permission to perform this action.',
        404: 'The requested resource was not found.',
        409: 'Conflict detected. The resource may have been modified by another user.',
        422: 'Invalid data provided. Please check your input.',
        429: 'Too many requests. Please wait a moment and try again.',
      };

      return {
        isRetryable: status === 429,
        isClientError: true,
        isServerError: false,
        isNetworkError: false,
        userMessage: userMessages[status] || 'Client error occurred. Please try again.',
        severity: status === 401 || status === 403 ? 'high' : 'low',
      };
    }

    // Server errors (5xx)
    if (status >= 500) {
      return {
        isRetryable: true,
        isClientError: false,
        isServerError: true,
        isNetworkError: false,
        userMessage: 'Server error occurred. Our team has been notified. Please try again later.',
        severity: 'critical',
      };
    }

    // Unknown errors
    return {
      isRetryable: false,
      isClientError: false,
      isServerError: false,
      isNetworkError: false,
      userMessage: 'An unexpected error occurred. Please try again.',
      severity: 'medium',
    };
  }

  private async handleUnauthorized(): Promise<void> {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (refreshToken) {
      try {
        // Attempt token refresh
        const response = await axios.post('/api/auth/refresh', {
          refreshToken,
        });
        
        localStorage.setItem('accessToken', response.data.accessToken);
        localStorage.setItem('refreshToken', response.data.refreshToken);
        
        logger.info('Token refreshed successfully');
      } catch (refreshError) {
        logger.warn('Token refresh failed', { error: refreshError });
        this.clearAuthAndRedirect();
      }
    } else {
      this.clearAuthAndRedirect();
    }
  }

  private clearAuthAndRedirect(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    
    // Redirect to login page
    window.location.href = '/login';
  }

  private handleForbidden(): void {
    // Show user-friendly message for forbidden access
    logger.warn('Access forbidden - user lacks required permissions');
  }

  private handleServerError(error: AxiosError): void {
    // Report server errors for monitoring
    logger.error('Server error detected', {
      status: error.response?.status,
      url: error.config?.url,
      correlationId: error.response?.headers['x-correlation-id'],
    });
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await this.circuitBreaker.execute(operation);
    } catch (error) {
      const axiosError = error as AxiosError & ClassifiedError;
      const shouldRetry = 
        retryCount < this.retryConfig.maxRetries &&
        (axiosError.isRetryable || this.retryConfig.retryableStatusCodes.includes(axiosError.response?.status || 0));

      if (shouldRetry) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(2, retryCount),
          this.retryConfig.maxDelay
        );

        logger.info(`Retrying request after ${delay}ms (attempt ${retryCount + 1}/${this.retryConfig.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeWithRetry(operation, retryCount + 1);
      }

      throw error;
    }
  }

  async get<T>(url: string, config?: object): Promise<T> {
    return this.executeWithRetry(async () => {
      const response: AxiosResponse<T> = await this.api.get(url, config);
      return response.data;
    });
  }

  async post<T>(url: string, data?: unknown, config?: object): Promise<T> {
    return this.executeWithRetry(async () => {
      const response: AxiosResponse<T> = await this.api.post(url, data, config);
      return response.data;
    });
  }

  async put<T>(url: string, data?: unknown, config?: object): Promise<T> {
    return this.executeWithRetry(async () => {
      const response: AxiosResponse<T> = await this.api.put(url, data, config);
      return response.data;
    });
  }

  async delete<T>(url: string, config?: object): Promise<T> {
    return this.executeWithRetry(async () => {
      const response: AxiosResponse<T> = await this.api.delete(url, config);
      return response.data;
    });
  }

  async patch<T>(url: string, data?: unknown, config?: object): Promise<T> {
    return this.executeWithRetry(async () => {
      const response: AxiosResponse<T> = await this.api.patch(url, data, config);
      return response.data;
    });
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/health');
      return true;
    } catch {
      return false;
    }
  }

  // Circuit breaker status
  getCircuitBreakerState(): CircuitState {
    return this.circuitBreaker.getState();
  }
}

export default new ApiService();