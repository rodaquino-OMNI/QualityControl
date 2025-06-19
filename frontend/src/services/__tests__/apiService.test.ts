import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('apiService', () => {
  const mockedAxios = axios as any;
  
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
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
      post: vi.fn().mockResolvedValue({ data: responseData }),
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
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn((success, error) => error) },
      },
    };
    
    mockedAxios.create = vi.fn(() => axiosInstance);
    
    const { default: apiService } = await import('@/services/apiService');
    
    await expect(apiService.get('/test')).rejects.toThrow(errorMessage);
  });

  it('should add auth token to requests', async () => {
    const token = 'test-token';
    localStorage.setItem('authToken', token);
    
    let requestInterceptor: any;
    const axiosInstance = {
      get: vi.fn().mockResolvedValue({ data: {} }),
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
    let responseInterceptor: any;
    const axiosInstance = {
      interceptors: {
        request: { use: vi.fn() },
        response: {
          use: vi.fn((_, error) => {
            responseInterceptor = { error };
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
    
    await expect(responseInterceptor.error(error)).rejects.toMatchObject(error);
  });
});