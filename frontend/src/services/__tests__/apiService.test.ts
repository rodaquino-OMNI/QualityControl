import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('apiService', () => {
  const mockedAxios = axios as any;
  
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Reset modules to ensure fresh imports
    vi.resetModules();
    
    // Set up default axios instance mock
    mockedAxios.create = vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create axios instance with correct config', async () => {
    await import('@/services/apiService');
    
    expect(mockedAxios.create).toHaveBeenCalledWith({
      baseURL: expect.stringContaining('/api'),
      timeout: expect.any(Number),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('should handle GET requests', async () => {
    const mockData = { id: 1, name: 'Test' };
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({ data: mockData }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    };
    
    mockedAxios.create = vi.fn(() => axiosInstance);
    
    const { default: apiService } = await import('@/services/apiService');
    const result = await apiService.get('/test');
    
    expect(axiosInstance.get).toHaveBeenCalledWith('/test', undefined);
    expect(result).toEqual(mockData);
  });

  it('should handle POST requests with data', async () => {
    const postData = { name: 'New Item' };
    const responseData = { id: 1, ...postData };
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({ data: responseData }),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    };
    
    mockedAxios.create = vi.fn(() => axiosInstance);
    
    const { default: apiService } = await import('@/services/apiService');
    const result = await apiService.post('/items', postData);
    
    expect(axiosInstance.post).toHaveBeenCalledWith('/items', postData, undefined);
    expect(result).toEqual(responseData);
  });

  it('should handle API errors', async () => {
    const errorMessage = 'Network Error';
    const axiosInstance = {
      get: vi.fn().mockRejectedValue(new Error(errorMessage)),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn((_, error) => Promise.reject(error)) },
      },
    };
    
    mockedAxios.create = vi.fn(() => axiosInstance);
    
    const { default: apiService } = await import('@/services/apiService');
    
    await expect(apiService.get('/test')).rejects.toThrow(errorMessage);
  });

  it('should add auth token to requests', async () => {
    const token = 'test-token';
    
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn((key: string) => key === 'accessToken' ? token : null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    
    let requestInterceptor: any;
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({ data: {} }),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn((interceptor) => {
            requestInterceptor = interceptor;
          }),
        },
        response: { use: vi.fn() },
      },
    };
    
    mockedAxios.create = vi.fn(() => axiosInstance);
    
    await import('@/services/apiService');
    
    // Test the request interceptor
    const config = { headers: {} };
    const modifiedConfig = requestInterceptor(config);
    
    expect(modifiedConfig.headers.Authorization).toBe(`Bearer ${token}`);
  });

  it('should handle token refresh on 401 errors', async () => {
    // Mock localStorage
    const localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    
    let errorInterceptor: any;
    const axiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      patch: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: {
          use: vi.fn((_, error) => {
            errorInterceptor = error;
          }),
        },
      },
    };
    
    mockedAxios.create = vi.fn(() => axiosInstance);
    
    await import('@/services/apiService');
    
    // Test 401 error handling
    const error = {
      response: { status: 401 },
      config: {},
    };
    
    await expect(errorInterceptor(error)).rejects.toMatchObject(error);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('authToken');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('refreshToken');
  });
});