import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// Standalone build for the CLI's bundled prompt UI.
// Output goes to dist-cli-prompt/; the CLI copies this into its npm package
// and serves it from its local HTTP server at localhost:3100.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist-cli-prompt',
    rollupOptions: {
      input: resolve(__dirname, 'cli-prompt.html'),
    },
  },
})
