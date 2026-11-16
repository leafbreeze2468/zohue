import { defineConfig } from 'vite';

// 用相對路徑，部署在 GitHub Pages 的子路徑（/zohue/）也能正常載入
export default defineConfig({ base: './' });
