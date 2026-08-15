import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(process.cwd(), 'web'),
  build: {
    outDir: resolve(process.cwd(), 'dist', 'web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        login: resolve(process.cwd(), 'web', 'login.html'),
        dashboard: resolve(process.cwd(), 'web', 'dashboard.html'),
      },
    },
  },
});
