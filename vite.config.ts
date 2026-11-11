import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// base: GitHub Pages 用 /one-board-one-deck/（由部署流程設定 VITE_BASE），
// Capacitor 打包與本機則用相對路徑 ./
export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/engine/**/*.test.ts'],
    environment: 'node',
  },
})
