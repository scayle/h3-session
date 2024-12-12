import eslintConfigStorefront from '@scayle/eslint-config-storefront'

export default eslintConfigStorefront({ isNuxt: false }).append(
  {
    rules: {
      'sonarjs/slow-regex': 'warn',
    },
  },
)
