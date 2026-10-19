import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy REST API
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Proxy WebSocket detection & viewer
      '/ws/detection': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/ws/view': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      // Proxy WebSocket stream (untuk simulator dari browser)
      '/ws/stream': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
