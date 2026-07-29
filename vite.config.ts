import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const packageMetadata = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version?: unknown }

if (
  typeof packageMetadata.version !== 'string' ||
  packageMetadata.version.trim() === ''
) {
  throw new Error('package.json version must be a non-empty string')
}

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      packageMetadata.version.trim(),
    ),
  },
  plugins: [react()],
  server: {
    port: 5173,
  },
})
