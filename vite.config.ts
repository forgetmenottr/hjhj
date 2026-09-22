/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: {
    // The solver worker is created with { type: "module" }.
    format: 'es',
  },
  test: {
    // Library code is DOM-free, so plain Node is enough. UI tests opt into
    // jsdom with a `// @vitest-environment jsdom` comment.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
