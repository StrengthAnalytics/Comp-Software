import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const config = defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': import.meta.dirname,
    },
  },
});

export default config;
