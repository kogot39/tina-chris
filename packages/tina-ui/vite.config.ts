import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isLibMode = mode === 'lib'

  if (isLibMode) {
    return {
      plugins: [vue(), tailwindcss()],
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'TinaUI',
          fileName: (format) => `tina-ui.${format}.js`,
        },
        rollupOptions: {
          // 确保外部化处理那些你不想打包进库的依赖
          external: ['vue'],
          output: {
            // 在 UMD 构建模式下为这些外部依赖提供一个全局变量
            globals: {
              vue: 'Vue',
            },
          },
        },
      },
    }
  }

  return {
    plugins: [vue(), tailwindcss()],
  }
})
