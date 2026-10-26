import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function swPrecachePlugin() {
  return {
    name: 'sw-precache-plugin',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const swDistPath = path.join(distDir, 'sw.js');
      if (!fs.existsSync(swDistPath)) return;

      const assetsDir = path.join(distDir, 'assets');
      const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
      const hashedAssets = assetFiles
        .filter((file) => file.endsWith('.js') || file.endsWith('.css') || file.endsWith('.svg') || file.endsWith('.png'))
        .map((file) => `/assets/${file}`);

      const precacheUrls = ['/', '/index.html', ...hashedAssets];

      let swContent = fs.readFileSync(swDistPath, 'utf8');
      swContent = swContent.replace(
        /\/\*\s*__PRECACHE_ASSETS__\s*\*\/ null/g,
        JSON.stringify(precacheUrls)
      );
      fs.writeFileSync(swDistPath, swContent, 'utf8');
      console.log(`[SW-Plugin] Injected ${precacheUrls.length} assets into dist/sw.js:`, precacheUrls);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), swPrecachePlugin()],
  server: {
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      '^/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '^/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    proxy: {
      '^/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '^/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
