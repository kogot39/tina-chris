import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

const internalWorkspacePackages = [
  '@tina-chris/tina-server',
  '@tina-chris/tina-bus',
  '@tina-chris/tina-util',
  '@tina-chris/live2d-model',
]

export default defineConfig({
  main: {
    build: {
      sourcemap: true,
      // 打安装包时不能依赖 pnpm 的 workspace junction。
      // 这里把内部包打进 main 产物，安装后的应用只需要携带 out 和内置资源即可启动。
      externalizeDeps: {
        exclude: internalWorkspacePackages,
      },
    },
    define: {
      // ws 会尝试加载 bufferutil / utf-8-validate 这两个可选原生加速包。
      // Electron main bundle 内缺少它们时，Vite 会把 optional require 转成启动即抛错。
      // 主进程这里显式关闭原生加速路径，让 ws 使用内置 JS fallback，开发和安装包都更稳定。
      'process.env.WS_NO_BUFFER_UTIL': JSON.stringify('1'),
      'process.env.WS_NO_UTF_8_VALIDATE': JSON.stringify('1'),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, '../../packages/tina-server/src'),
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
      externalizeDeps: {
        exclude: internalWorkspacePackages,
      },
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
