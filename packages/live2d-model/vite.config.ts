import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        components: resolve(__dirname, 'src/components/index.ts'),
        'model-storage': resolve(__dirname, 'src/modelStorage/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vue',
        'vue-router',
        '@vueuse/core',
        '@ricky0123/vad-web',
        'onnxruntime-web',
        'pixi-live2d-display',
        /^@pixi\//,
        /^node:/,
        'fs',
        'fs/promises',
        'path',
        'url',
        'crypto',
      ],
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: 'chunks/[name]-[hash].mjs',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    sourcemap: true,
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
})
