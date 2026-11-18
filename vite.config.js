import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const fishTextProxy = {
  '/fish-text': {
    target: 'https://fish-text.ru',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/fish-text/, '/get'),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    proxy: fishTextProxy,
  },
  preview: {
    proxy: fishTextProxy,
  },
})
