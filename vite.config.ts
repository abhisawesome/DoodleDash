import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: {
      '/api/ws': {
        target: 'http://127.0.0.1:5174',
        ws: true,
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts', exclude: ['e2e/**', 'node_modules/**'] },
})
