import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 修复安卓APK本地加载路径（核心！解决空白）
export default defineConfig({
  plugins: [vue()],
  base: './', // 关键代码：相对路径，APK必备
  build: {
    outDir: 'dist'
  }
})
