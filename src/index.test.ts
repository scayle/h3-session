import { describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'uncrypto'
import {
  validateConfig,
  signCookie,
  unsignCookie,
  useSession,
  UnstorageSessionStore,
} from './index'
import type { H3SessionOptions } from './index'
import { createStorage } from 'unstorage'
import MemoryDriver from 'unstorage/drivers/memory'
import type { H3Event, PlainRequest } from 'h3'
import {
  toPlainHandler,
  createApp,
  defineEventHandler,
  getResponseHeaders,
} from 'h3'
import { parse } from 'cookie-es'

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

// Testing useSession should be easier in h3 v2 with mockEvent
// https://github.com/unjs/h3/issues/676
async function testMiddleware(
  request: PlainRequest,
  config: Parameters<typeof useSession>[1],
): Promise<H3Event> {
  let event: H3Event | undefined
  let error: Error | undefined

  const handler = defineEventHandler(async _event => {
    try {
      await useSession(_event, config)
      event = _event
    } catch (e: unknown) {
      error = e as Error
    }
  })

  await toPlainHandler(createApp().use(handler))(request)

  if (error) {
    throw error
  }

  if (!event) {
    throw new Error('event was not found')
  }

  return event
}

describe('useSession', () => {
  it('should skip the session creation if one already exists', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const genid = vi.fn().mockImplementation(() => 'testId')

    const handler = defineEventHandler(async event => {
      await useSession(event, { store, secret, genid })
      await useSession(event, { store, secret, genid })
    })

    await toPlainHandler(createApp().use(handler))({
      path: '/',
      method: 'GET',
      headers: {},
    })

    expect(genid).toHaveBeenCalledOnce()
  })

  it('should add a session and sessionId to the context', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'

    const { context } = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, { store, secret })

    expect(context.sessionId).toBeDefined()
    expect(context.session).toBeDefined()
  })

  it('should read the session id from the cookie', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'

    const { context } = await testMiddleware({
      method: 'GET',
      path: '/hello/world',
      headers: {
        Cookie: `connect.sid=${await signCookie(sessionId, secret)}`,
      },
    }, { store, secret })

    expect(context.sessionId).toEqual(sessionId)
    expect(context.session).toBeDefined()
    expect(context.session.id).toEqual(sessionId)
  })

  it('should get the existing session data from storage', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'

    store.set(sessionId, { hello: 'world' })

    const { context } = await testMiddleware({
      method: 'GET',
      path: '/hello/world',
      headers: {
        Cookie: `connect.sid=${await signCookie(sessionId, secret)}`,
      },
    }, { store, secret })

    expect(context.sessionId).toBeDefined()
    // @ts-expect-error the session data is untyped
    expect(context.session.data.hello).toEqual('world')
  })

  it('should generate new session data using the provided generator', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'

    const { context } = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, {
      store,
      secret,
      generate() {
        return { hello: 'world' }
      },
    })

    expect(context.sessionId).toBeDefined()
    expect(context.session).toBeDefined()
    // @ts-expect-error the session data is untyped
    expect(context.session.data.hello).toEqual('world')
  })

  it('should generate new session id using the provided generator', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'

    const { context } = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, {
      store,
      secret,
      genid() {
        return 'custom-id'
      },
    })
    expect(context.sessionId).toEqual('custom-id')
    expect(context.session).toBeDefined()
  })

  it('should save the session to storage when save is called', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'

    const { context } = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, {
      store,
      secret,
      genid() {
        return sessionId
      },
    })

    expect(await store.get(sessionId)).toEqual(undefined) // not saving uninitialized

    // @ts-expect-error the session data is untyped
    context.session.data.userId = '123'
    context.session.save()

    expect(await store.get(sessionId)).toEqual({ userId: '123' })
  })

  it('should save an empty session when saveUninitialized is true', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'

    await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, {
      store,
      secret,
      saveUninitialized: true,
      genid() {
        return sessionId
      },
    })

    expect(await store.get(sessionId)).toEqual({})
  })

  it('should re-save an existing session to bump the ttl', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'
    const spy = vi.spyOn(store, 'touch')

    await store.set(sessionId, { hello: 'world' })

    await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {
        Cookie: `connect.sid=${await signCookie(sessionId, secret)}`,
      },
    }, {
      store,
      secret,
      saveUninitialized: true,
    })

    expect(store.touch).toHaveBeenCalledWith(sessionId, { hello: 'world' })
    spy.mockClear()
  })

  it('should handle the storage returning an error fetching an existing session', async () => {
    const memory = MemoryDriver()
    const store = new UnstorageSessionStore(
      createStorage({ driver: memory }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'
    await store.set(sessionId, { hello: 'world' })
    const cookie = `connect.sid=${await signCookie(sessionId, secret)}`

    const _getItem = memory.getItem
    memory.getItem = function() {
      throw new Error('Something went wrong!')
    }

    // If getItem results in an error, an error should be thrown
    // We should not fallback to an empty session as that could result in
    // overriding existing session data.
    await expect(testMiddleware({
      path: '/',
      method: 'GET',
      headers: {
        Cookie: cookie,
      },
    }, {
      store,
      secret,
      saveUninitialized: true,
      genid() {
        return sessionId
      },
    })).rejects.toThrow()

    memory.getItem = _getItem

    // If a subsequent request for the session succeeds, the
    // original data should still be present
    const { context } = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {
        Cookie: cookie,
      },
    }, {
      store,
      secret,
      saveUninitialized: true,
      genid() {
        return sessionId
      },
    })

    expect(context.sessionId).toBeDefined()
    // @ts-expect-error the session data is untyped
    expect(context.session.data.hello).toEqual('world')
  })

  it('should sign the cookie header with the last secret in the array', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secrets = ['secret', 'newSecret']
    const sessionId = 'asdf123'

    const signedWithNew = await signCookie(sessionId, secrets[1])

    const event = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, {
      store,
      secret: secrets,
      saveUninitialized: true,
      genid() {
        return sessionId
      },
    })

    const headers = getResponseHeaders(event)
    const parsedSetCookie = parse(
      headers['set-cookie'] ?? '',
    )
    expect(parsedSetCookie['connect.sid']).toEqual(signedWithNew)
  })

  it('should update the set-cookie header when cookie properties are changed', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'

    const event = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, {
      store,
      secret,
      saveUninitialized: true,
      genid() {
        return sessionId
      },
    })

    const initialCookie = getResponseHeaders(event)['set-cookie']

    event.context.session.cookie.expires = new Date(Date.now())

    const newCookie = getResponseHeaders(event)['set-cookie']
    expect(newCookie).to.not.equal(initialCookie)
    expect(typeof newCookie).to.equal('string')
  })

  it('should not allow updating the cookie name, path or domain', async () => {
    const store = new UnstorageSessionStore(
      createStorage({ driver: MemoryDriver() }),
    )
    const secret = 'secret'
    const sessionId = 'asdf123'

    const event = await testMiddleware({
      path: '/',
      method: 'GET',
      headers: {},
    }, {
      store,
      secret,
      saveUninitialized: true,
      genid() {
        return sessionId
      },
    })

    expect(() => {
      event.context.session.cookie.name = 'new-name'
    }).toThrow(
      new Error('[h3-session] Cannot change name on a session cookie!'),
    )

    expect(() => {
      event.context.session.cookie.path = '/foo'
    }).toThrow(
      new Error('[h3-session] Cannot change path on a session cookie!'),
    )

    expect(() => {
      event.context.session.cookie.domain = 'example.com'
    }).toThrow(
      new Error('[h3-session] Cannot change domain on a session cookie!'),
    )
  })
})
