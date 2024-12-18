import { describe, expect, it } from 'vitest'
import { randomUUID } from 'uncrypto'
import {
  validateConfig,
  type H3SessionOptions,
  signCookie,
  unsignCookie,
} from './index'

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

describe('cookie signing', () => {
  describe('signCookie', () => {
    it('should throw an error if no value is provided', async () => {
      // @ts-expect-error - this function is intentionally being called incorrectly
      await expect(signCookie())
        .rejects
        .toThrow(new Error('[h3-session] No value was provided!'))
    })

    it('should throw an error if no secret is provided', async () => {
      // @ts-expect-error - this function is intentionally being called incorrectly
      await expect(signCookie('hello'))
        .rejects
        .toThrow(new Error('[h3-session] No secret was provided!'))
    })

    it('should match the expected format', async () => {
      const tests = [
        ['Luke', 's:Luke.qgkMwFbWmKhCsCGpAgWunY49jYk1ULKSJFyxnx37tuo'],
        ['Leia', 's:Leia.a9u9KEy64na2HMFHJZ3dlYxgK1blLha9DYNj5actKFc'],
        ['Han', 's:Han.HPYwehXbAUpHBJxNGCmM5FmeWcKsFt5oqIuLoypOxd4'],
        [
          'Chewbacca',
          's:Chewbacca.ARXGTLQsKtoISslOZxyGqg4Vy+QHNuosDazoqTKMPjY',
        ],
        ['Yoda', 's:Yoda.3jFPMJnzRx6I8OwMH2qUYXhMCZZf5iYH02n04PM43No'],
      ]

      for (let i = 0; i < tests.length; i++) {
        expect(await signCookie(tests[i][0], 'mySecret')).toBe(tests[i][1])
      }
    })
  })

  describe('unsignCookie', () => {
    it('should return false when the format is incorrect', async () => {
      const badCookies = [
        's',
        'asdfasdffasdfasdfasdf',
        'hello!!!!',
        's:ahskdjfhaskhdfkjashdkfhsaasdfsadkfjaaasdfksdjf',
      ]

      for (let i = 0; i < badCookies.length; i++) {
        expect(await unsignCookie(badCookies[i], ['mySecret'])).toBe(false)
      }
    })
  })

  it('signing and unsigning with the same secret should return the original value', async () => {
    for (let i = 0; i < 100; i++) {
      const id = randomUUID()
      expect(await unsignCookie(await signCookie(id, 'mySecret'), ['mySecret']))
        .toEqual(id)
    }
    for (let i = 0; i < 100; i++) {
      const id = randomUUID()
      const digits = (i % 4) + 1
      const value = `${'1'.repeat(digits)}:${id}`
      expect(
        await unsignCookie(await signCookie(value, 'mySecret'), ['mySecret']),
      ).toEqual(value)
    }
  })

  it('signing and unsigning with the same secret somewhere in the list should return the original value', async () => {
    for (let i = 0; i < 100; i++) {
      const id = randomUUID()
      expect(
        await unsignCookie(await signCookie(id, 'mySecret'), [
          'wrong',
          'oldSecret',
          'mySecret',
          'newerSecret',
        ]),
      ).toEqual(id)
    }
    for (let i = 0; i < 100; i++) {
      const id = randomUUID()
      const digits = (i % 4) + 1
      const value = `${'1'.repeat(digits)}:${id}`
      expect(
        await unsignCookie(await signCookie(value, 'mySecret'), [
          'wrong',
          'oldSecret',
          'mySecret',
          'newerSecret',
        ]),
      ).toEqual(value)
    }
  })

  it('signing and unsigning with different secrets should return false', async () => {
    for (let i = 0; i < 100; i++) {
      const id = randomUUID()
      expect(
        await unsignCookie(await signCookie(id, 'mySecret1'), ['mySecret2']),
      ).toBe(false)
    }
    for (let i = 0; i < 100; i++) {
      const id = randomUUID()
      const digits = (i % 4) + 1
      const value = `${'1'.repeat(digits)}:${id}`
      expect(
        await unsignCookie(await signCookie(value, 'mySecret1'), ['mySecret2']),
      ).toBe(false)
    }
  })
})
