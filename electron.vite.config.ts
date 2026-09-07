import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve('shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      lib: { entry: resolve('electron/main.ts') },
      rollupOptions: { output: { format: 'es', entryFileNames: 'index.js' } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      lib: { entry: resolve('electron/preload.ts') },
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } }
    }
  },
  renderer: {
    root: resolve('src'),
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@shared': shared, '@': resolve('src') } },
    build: {
      rollupOptions: { input: { index: resolve('src/index.html') } }
    }
  }
})
