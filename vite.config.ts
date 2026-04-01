import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './', // 🔥 核心：修复安卓APK空白（相对路径）
  build: {
    outDir: 'dist'
  }
})
