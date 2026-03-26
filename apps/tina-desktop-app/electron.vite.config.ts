import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/main'),
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/preload'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/render'),
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/render/index.html'),
      },
    },
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/render'),
      },
    },
    publicDir: resolve(__dirname, 'public'),
  },
})
