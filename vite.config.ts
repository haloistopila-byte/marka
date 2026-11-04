import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Vendor code changes rarely: separate chunks stay cached across deploys
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react-dom') || id.includes('react-router') || id.match(/node_modules\/react\//) || id.includes('scheduler')) return 'vendor-react';
            return undefined;
          }
        }
      }
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      strictPort: true,
      allowedHosts: true as const,
    },
  };
});
