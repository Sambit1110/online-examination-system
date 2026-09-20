import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Legacy local Express backend (see server/). The Supabase path does
      // not use this; only `api/admin-users` is served by Vercel in production.
      '/api': {
        target: 'http://localhost:5050',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        // Split the rarely-changing vendor code out of the app chunk so a
        // routine deploy does not invalidate React/Supabase in every cache.
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js']
        }
      }
    }
  }
});
