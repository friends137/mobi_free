import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './', // 固定安卓APK不空白
  build: { outDir: 'dist' }
})
