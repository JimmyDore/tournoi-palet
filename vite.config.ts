/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // En dev, le serveur tourne à côté (npm run dev:server) : même origine côté navigateur.
    // `ws: true` est indispensable, sans lui Vite répond 400 à l'upgrade WebSocket.
    proxy: {
      '/api': 'http://localhost:8787',
      '/health': 'http://localhost:8787',
      '/ws': { target: 'http://localhost:8787', ws: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
