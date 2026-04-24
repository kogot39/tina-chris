import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: './dist',
  clean: true,
  dts: true,
  format: 'esm',
})
