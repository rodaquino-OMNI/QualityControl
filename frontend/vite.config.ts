/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@store': path.resolve(__dirname, './src/store'),
      '@services': path.resolve(__dirname, './src/services'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Copy service worker to root for proper scope
    copyPublicDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core vendor chunks for optimal loading
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor';
          }
          if (id.includes('node_modules/react-router-dom/')) {
            return 'router';
          }
          if (id.includes('node_modules/@reduxjs/toolkit/') || id.includes('node_modules/react-redux/')) {
            return 'redux';
          }
          
          // Feature-specific chunks for code splitting
          if (id.includes('node_modules/recharts/') || id.includes('node_modules/d3/')) {
            return 'charts';
          }
          if (id.includes('node_modules/lucide-react/')) {
            return 'icons';
          }
          if (id.includes('node_modules/date-fns/') || id.includes('node_modules/jspdf/') || id.includes('node_modules/exceljs/')) {
            return 'utils';
          }
          if (id.includes('node_modules/idb/')) {
            return 'offline';
          }
          
          // Healthcare-specific chunks
          if (id.includes('src/components/mobile/')) {
            return 'mobile-components';
          }
          if (id.includes('src/components/analytics/')) {
            return 'analytics';
          }
          if (id.includes('src/components/cases/')) {
            return 'cases';
          }
        },
        // Optimize chunk sizes for mobile networks
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId 
            ? chunkInfo.facadeModuleId.split('/').pop()?.replace('.tsx', '').replace('.ts', '') 
            : 'chunk';
          return `assets/${facadeModuleId}-[hash].js`;
        },
      },
    },
    // Increase chunk size warning for mobile optimization
    chunkSizeWarningLimit: 800,
    
    // Mobile-specific build optimizations
    target: ['es2015', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.debug'],
        // Keep emergency console functions
        pure_getters: true,
        unsafe_comps: true,
        unsafe_math: true,
        passes: 2
      },
      mangle: {
        safari10: true,
        keep_fnames: /^(Emergency|Critical|Alert)/
      },
      format: {
        comments: false
      }
    },
    
    // PWA-specific build settings
    assetsInlineLimit: 4096, // Inline small assets
    cssCodeSplit: true,
    reportCompressedSize: false, // Faster builds
    
    // PWA and mobile optimization
    emptyOutDir: true
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@reduxjs/toolkit',
      'react-redux',
      'recharts',
      'd3',
      'date-fns',
      'jspdf',
      'exceljs',
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    
    // Use centralized coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        '**/*.stories.tsx',
        'src/**/__tests__/**',
        'src/**/mockData.ts',
      ],
      // Standardized coverage thresholds (upgraded to match backend)
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
    
    // Test timeout standardization
    testTimeout: 5000,
    
    // Test execution optimization
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
      },
    },
    
    // Enhanced reporting
    reporters: [
      'default',
      'html',
      ['junit', {
        outputFile: '../test-results/frontend-vitest-junit.xml',
      }],
    ],
    
    // Test isolation
    clearMocks: true,
    restoreMocks: true,
    
    // Performance monitoring
    slowTestThreshold: 1000,
  },
});