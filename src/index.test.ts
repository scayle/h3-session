import { describe, expect, it } from 'vitest'

import { validateConfig, type H3SessionOptions } from './index'

describe('validateConfig', () => {
  it('should require store to be defined', () => {
    expect(() => validateConfig({ secret: 'hello' } as H3SessionOptions))
      .toThrow(new Error('[h3-session] Session store is required!'))
  })

  it('should require secret to be defined', () => {
    expect(() => validateConfig({ store: {} } as H3SessionOptions)).toThrow(
      new Error('[h3-session] Session secret is required!'),
    )
  })
})
