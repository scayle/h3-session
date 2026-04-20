import { subtle } from 'uncrypto'

const _signKeys: Record<string, CryptoKey> = {}

/**
 * Return a `CryptoKey` that can be used for signing with the provided secret
 *
 * @param secret the secret string to sign with
 */
export async function getCryptoSignKey(secret: string): Promise<CryptoKey> {
  if (_signKeys[secret]) {
    return _signKeys[secret]
  }

  const encoder = new TextEncoder()
  // Convert the secret to a Uint8Array
  const keyUint8Array = encoder.encode(secret)

  // Import the secret as a CryptoKey
  const cryptoKey = await subtle.importKey(
    'raw',
    keyUint8Array,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  _signKeys[secret] = cryptoKey
  return cryptoKey
}

const _verifyKeys: Record<string, CryptoKey> = {}

/**
 * Return a `CryptoKey` that can be used for verifying with the provided secret
 *
 * @param secret the secret string to verify with
 */
export async function getCryptoVerifyKey(secret: string): Promise<CryptoKey> {
  if (_verifyKeys[secret]) {
    return _verifyKeys[secret]
  }

  const encoder = new TextEncoder()
  // Convert the secret to a Uint8Array
  const keyUint8Array = encoder.encode(secret)

  // Import the secret as a CryptoKey
  const cryptoKey = await subtle.importKey(
    'raw',
    keyUint8Array,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  _verifyKeys[secret] = cryptoKey
  return cryptoKey
}
