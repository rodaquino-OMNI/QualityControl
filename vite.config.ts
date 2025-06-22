import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
      '@components': path.resolve(__dirname, './frontend/src/components'),
      '@services': path.resolve(__dirname, './frontend/src/services'),
      '@utils': path.resolve(__dirname, './frontend/src/utils'),
      '@types': path.resolve(__dirname, './frontend/src/types'),
      '@hooks': path.resolve(__dirname, './frontend/src/hooks'),
      '@store': path.resolve(__dirname, './frontend/src/store'),
      '@assets': path.resolve(__dirname, './frontend/src/assets'),
    },
  },
  server: {
    port: 3000,
    host: true,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'redux-vendor': ['@reduxjs/toolkit', 'react-redux'],
          'ui-vendor': ['recharts', 'd3'],
        },
      },
    },
  },
});