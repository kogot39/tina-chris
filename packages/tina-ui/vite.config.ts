import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const isLib = mode === 'lib'

  return {
    plugins: [vue(), tailwindcss()],
    build: isLib
      ? {
          lib: {
            entry: './src/index.ts',
            name: 'TinaUI',
            formats: ['es', 'cjs'],
            cssFileName: 'style',
            fileName: (format) => (format === 'es' ? 'index.js' : 'index.cjs'),
          },
          rollupOptions: {
            external: ['vue'],
            output: {
              exports: 'named',
              globals: {
                vue: 'Vue',
              },
            },
          },
        }
      : undefined,
  }
})
