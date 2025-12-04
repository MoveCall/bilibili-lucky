import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    // 关键修改：设置为相对路径，适配 GitHub Pages 的子目录部署
    base: './', 
    plugins: [react()],
  };
});