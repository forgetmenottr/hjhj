/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves the site at https://<user>.github.io/<repo>/, so the
// build (and `vite preview` of it) uses /<repo>/ as base. In GitHub Actions
// GITHUB_REPOSITORY is "owner/repo"; locally it falls back to this repo's name.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'tkb_web'

// https://vite.dev/config/
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? `/${repo}/` : '/',
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
}))
