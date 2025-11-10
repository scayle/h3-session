import { defineConfig } from 'vitest/config'
import { vitestCIConfigThreading } from '@scayle/vitest-config-storefront'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,js,mjs}'],
      reporter: ['text', 'cobertura'],
    },
    ...vitestCIConfigThreading,
  },
})
