import { describe, expect, it } from 'vitest'

import { getCryptoSignKey, getCryptoVerifyKey } from './crypto'

describe('getCryptoSignKey', () => {
  it('returns a CryptoKey for the secret', async () => {
    const key = await getCryptoSignKey('my-secret')
    expect(key instanceof CryptoKey).toBe(true)
  })

  it('returns an existing CryptoKey if one exists for the secret', async () => {
    const key1 = await getCryptoSignKey('my-secret')
    const key2 = await getCryptoSignKey('my-secret')

    expect(key1).toBe(key2)
  })

  it('returns a different CryptoKey for different secrets', async () => {
    const key1 = await getCryptoSignKey('my-secret')
    const key2 = await getCryptoSignKey('my-new-secret')

    expect(key1).not.toBe(key2)
  })
})

describe('getCryptoVerifyKey', () => {
  it('returns a CryptoKey for the secret', async () => {
    const key = await getCryptoVerifyKey('my-secret')
    expect(key instanceof CryptoKey).toBe(true)
  })

  it('returns an existing CryptoKey if one exists for the secret', async () => {
    const key1 = await getCryptoVerifyKey('my-secret')
    const key2 = await getCryptoVerifyKey('my-secret')

    expect(key1).toBe(key2)
  })

  it('returns a different CryptoKey for different secrets', async () => {
    const key1 = await getCryptoVerifyKey('my-secret')
    const key2 = await getCryptoVerifyKey('my-new-secret')

    expect(key1).not.toBe(key2)
  })
})
