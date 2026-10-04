import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = process.env.VITE_API_TARGET ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ['/v1', '/auth', '/webhooks', '/healthz', '/readyz', '/docs'].map((p) => [
        p,
        { target: API, changeOrigin: false },
      ]),
    ),
  },
  build: { sourcemap: false, target: 'es2022' },
});
