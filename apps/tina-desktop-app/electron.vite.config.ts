import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      sourcemap: true,
    },
    resolve: {
      alias: {
        '@tina-chris/tina-server': resolve(
          __dirname,
          '../../packages/tina-server/src'
        ),
        '@tina-chris/tina-bus': resolve(
          __dirname,
          '../../packages/tina-bus/src'
        ),
        '@tina-chris/tina-util': resolve(
          __dirname,
          '../../packages/tina-util/src'
        ),
        '@tina-chris/live2d-model/model-storage': resolve(
          __dirname,
          '../../packages/live2d-model/src/modelStorage'
        ),
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
        '@tina-chris/tina-server': resolve(
          __dirname,
          '../../packages/tina-server/src'
        ),
        '@tina-chris/tina-bus': resolve(
          __dirname,
          '../../packages/tina-bus/src'
        ),
        '@tina-chris/tina-util': resolve(
          __dirname,
          '../../packages/tina-util/src'
        ),
        '@tina-chris/live2d-model/model-storage': resolve(
          __dirname,
          '../../packages/live2d-model/src/modelStorage'
        ),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/render'),
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/render/main/index.html'),
          setting: resolve(__dirname, 'src/render/setting/index.html'),
        },
      },
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag === 'iconpark-icon',
          },
        },
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: [
        {
          find: '@tina-chris/live2d-model',
          replacement: resolve(__dirname, '../../packages/live2d-model/src'),
        },
      ],
    },
    publicDir: resolve(__dirname, 'public'),
  },
})
