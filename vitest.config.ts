import { defineProject } from 'vitest/config'
import { vitestCIConfigThreading } from '@scayle/vitest-config-storefront'
import { name } from './package.json'

export default defineProject({
  test: {
    name: `v2:${name}`,
    globals: true,
    ...vitestCIConfigThreading,
  },
})
