/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Library code is DOM-free, so plain Node is enough.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
