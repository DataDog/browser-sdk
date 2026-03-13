import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
  },
  preview: {
    port: 5175,
    strictPort: true,
  },
  server: {
    port: 5175,
    strictPort: true,
  },
})
