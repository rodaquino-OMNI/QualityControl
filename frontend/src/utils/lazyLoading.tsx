/**
 * Lazy Loading Utilities for Healthcare PWA
 * Optimized for mobile performance with healthcare-specific loading strategies
 */

import React, { Suspense, ComponentType, LazyExoticComponent } from 'react';
import LoadingSpinner from '../components/common/LoadingSpinner';

// Loading component configurations for different contexts
interface LoadingConfig {
  component: React.ComponentType;
  fallbackText?: string;
  minDelay?: number;
  timeout?: number;
  critical?: boolean;
}

// Healthcare-specific loading configurations
const loadingConfigs: Record<string, LoadingConfig> = {
  dashboard: {
    component: () => (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <LoadingSpinner size="large" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Loading Dashboard
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Preparing your healthcare overview...
          </p>
        </div>
      </div>
    ),
    minDelay: 300,
    timeout: 10000
  },
  
  cases: {
    component: () => (
      <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
        <LoadingSpinner size="medium" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Loading Cases
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Fetching patient cases...
          </p>
        </div>
      </div>
    ),
    minDelay: 200,
    timeout: 8000
  },
  
  analytics: {
    component: () => (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <LoadingSpinner size="large" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Loading Analytics
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Calculating quality metrics...
          </p>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-500">
            This may take a moment on slower connections
          </div>
        </div>
      </div>
    ),
    minDelay: 400,
    timeout: 15000
  },
  
  emergency: {
    component: () => (
      <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4 bg-red-50 dark:bg-red-900 rounded-lg p-6">
        <div className="animate-pulse">
          <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-xl">!</span>
          </div>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200">
            Loading Emergency Protocols
          </h3>
          <p className="text-red-600 dark:text-red-400 mt-1">
            Preparing critical access...
          </p>
        </div>
      </div>
    ),
    minDelay: 100,
    timeout: 5000,
    critical: true
  },
  
  mobile: {
    component: () => (
      <div className="flex flex-col items-center justify-center min-h-[250px] space-y-3">
        <LoadingSpinner size="medium" />
        <div className="text-center px-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            Loading Mobile View
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Optimizing for your device...
          </p>
        </div>
      </div>
    ),
    minDelay: 150,
    timeout: 6000
  },
  
  settings: {
    component: () => (
      <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4">
        <LoadingSpinner size="medium" />
        <div className="text-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Loading Settings
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Preparing configuration options...
          </p>
        </div>
      </div>
    ),
    minDelay: 200,
    timeout: 8000
  }
};

// Error boundary for lazy loaded components
interface LazyErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class LazyErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ComponentType<{ error: Error }> },
  LazyErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): LazyErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lazy loading error:', error, errorInfo);
    
    // Track error for analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', 'lazy_loading_error', {
        event_category: 'Performance',
        event_label: error.message,
        error_details: errorInfo.componentStack
      });
    }
  }

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error!} />;
    }

    return this.props.children;
  }
}

// Default error fallback component
const DefaultErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4 p-6 bg-red-50 dark:bg-red-900 rounded-lg">
    <div className="w-16 h-16 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center">
      <span className="text-red-600 dark:text-red-300 text-2xl">⚠️</span>
    </div>
    <div className="text-center">
      <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
        Loading Failed
      </h3>
      <p className="text-red-600 dark:text-red-400 text-sm mb-4">
        This component failed to load. Please try refreshing the page.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
      >
        Refresh Page
      </button>
    </div>
    {process.env.NODE_ENV === 'development' && (
      <details className="mt-4 text-xs text-red-700 dark:text-red-300">
        <summary className="cursor-pointer">Error Details</summary>
        <pre className="mt-2 p-2 bg-red-100 dark:bg-red-800 rounded overflow-auto">
          {error.message}
        </pre>
      </details>
    )}
  </div>
);

// Enhanced lazy loading with healthcare-specific optimizations
export function createLazyComponent<T extends ComponentType<any>>(
  importFunction: () => Promise<{ default: T }>,
  options: {
    configKey?: keyof typeof loadingConfigs;
    preload?: boolean;
    retryCount?: number;
    fallback?: React.ComponentType<{ error: Error }>;
    critical?: boolean;
  } = {}
): LazyExoticComponent<T> {
  const {
    configKey = 'dashboard',
    preload = false,
    retryCount = 3,
    fallback,
    critical = false
  } = options;

  // Create enhanced import function with retry logic
  const enhancedImport = async (): Promise<{ default: T }> => {
    let attempts = 0;
    let lastError: Error;

    while (attempts < retryCount) {
      try {
        // Add artificial delay for critical components to ensure they load properly
        if (critical && attempts === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const module = await importFunction();
        
        // Track successful load
        if (typeof gtag !== 'undefined') {
          gtag('event', 'component_loaded', {
            event_category: 'Performance',
            event_label: configKey,
            attempts: attempts + 1
          });
        }

        return module;
      } catch (error) {
        lastError = error as Error;
        attempts++;
        
        console.warn(`Lazy loading attempt ${attempts} failed for ${configKey}:`, error);
        
        // Exponential backoff for retries
        if (attempts < retryCount) {
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Track final failure
    if (typeof gtag !== 'undefined') {
      gtag('event', 'component_load_failed', {
        event_category: 'Performance',
        event_label: configKey,
        attempts
      });
    }

    throw lastError!;
  };

  // Create lazy component
  const LazyComponent = React.lazy(enhancedImport);

  // Preload if requested and connection is good
  if (preload && navigator.connection?.effectiveType !== 'slow-2g') {
    setTimeout(() => {
      enhancedImport().catch(() => {
        // Ignore preload errors
      });
    }, 2000);
  }

  // Return wrapped component with suspense and error boundary
  const WrappedComponent = (props: any) => {
    const config = loadingConfigs[configKey];
    
    return (
      <LazyErrorBoundary fallback={fallback}>
        <Suspense fallback={<config.component />}>
          <LazyComponent {...props} />
        </Suspense>
      </LazyErrorBoundary>
    );
  };
  
  return WrappedComponent as unknown as LazyExoticComponent<T>;
}

// Preload strategy for healthcare workflows
export const preloadStrategy = {
  // Preload critical components immediately
  immediate: ['emergency', 'cases'],
  
  // Preload on user interaction
  onInteraction: ['analytics', 'settings'],
  
  // Preload on idle
  onIdle: ['mobile'],
  
  // Preload based on route
  byRoute: {
    '/dashboard': ['cases', 'analytics'],
    '/cases': ['analytics'],
    '/emergency': ['cases']
  }
};

// Preload components based on strategy
export function preloadComponents(strategy: keyof typeof preloadStrategy | string[]): void {
  const componentsToPreload: string[] = Array.isArray(strategy) 
    ? strategy 
    : (preloadStrategy[strategy as keyof typeof preloadStrategy] as string[]) || [];

  componentsToPreload.forEach(component => {
    // This would be replaced with actual component imports
    console.log(`Preloading component: ${component}`);
  });
}

// Hook for intersection-based lazy loading
export function useIntersectionLazyLoad(
  ref: React.RefObject<Element>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, options]);

  return isVisible;
}

// Network-aware loading
export function useNetworkAwareLoading(): {
  shouldLoadHeavyComponents: boolean;
  connectionType: string;
  isSlowConnection: boolean;
} {
  const [networkInfo, setNetworkInfo] = React.useState({
    shouldLoadHeavyComponents: true,
    connectionType: 'unknown',
    isSlowConnection: false
  });

  React.useEffect(() => {
    const connection = navigator.connection;
    
    if (connection) {
      const updateNetworkInfo = () => {
        const effectiveType = connection.effectiveType || 'unknown';
        const isSlowConnection = ['slow-2g', '2g'].includes(effectiveType);
        
        setNetworkInfo({
          shouldLoadHeavyComponents: !isSlowConnection,
          connectionType: effectiveType,
          isSlowConnection
        });
      };

      updateNetworkInfo();
      connection.addEventListener?.('change', updateNetworkInfo);

      return () => {
        connection.removeEventListener?.('change', updateNetworkInfo);
      };
    }
  }, []);

  return networkInfo;
}

// Memory-aware loading
export function useMemoryAwareLoading(): {
  shouldOptimizeMemory: boolean;
  deviceMemory: number;
} {
  const [memoryInfo, setMemoryInfo] = React.useState({
    shouldOptimizeMemory: false,
    deviceMemory: 4 // Default assumption
  });

  React.useEffect(() => {
    const deviceMemory = (navigator as any).deviceMemory || 4;
    
    setMemoryInfo({
      shouldOptimizeMemory: deviceMemory < 4,
      deviceMemory
    });
  }, []);

  return memoryInfo;
}

// Utility to create route-based lazy components
export function createRouteLazyComponent<T extends ComponentType<any>>(
  importFunction: () => Promise<{ default: T }>,
  routeName: string
): LazyExoticComponent<T> {
  return createLazyComponent(importFunction, {
    configKey: routeName in loadingConfigs ? routeName as keyof typeof loadingConfigs : 'dashboard',
    preload: preloadStrategy.immediate.includes(routeName),
    critical: routeName === 'emergency'
  });
}

export { loadingConfigs, LazyErrorBoundary };