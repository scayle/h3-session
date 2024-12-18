import { describe, expect, it, vi } from 'vitest'

import { Session } from './session'
import type {
  SessionStore,
  SessionCookie,
  SessionDataT,
  RawSession,
} from './index'

function createDummyStore(): SessionStore {
  return {
    all: () => Promise.resolve([]),
    destroy: async (_sid: string) => {},
    clear: async () => {},
    length: () => Promise.resolve(0),
    get: (_sid: string) => {
      return Promise.resolve({ reloaded: 'data' })
    },
    set: async (_sid: string, _data: RawSession) => {},
    touch: async (_sid: string, _data: SessionDataT) => {},
  }
}

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30

function createDummyCookie(): SessionCookie {
  return {
    setSessionId: async (_sid: string) => {},
    path: '/',
    httpOnly: true,
    secure: true,
    maxAge: DEFAULT_MAX_AGE,
  }
}

const generateFn = () => Promise.resolve({ id: 'bar', data: { msg: 'hello' } })

describe('session', () => {
  it('id should return the id', () => {
    const store = createDummyStore()
    const cookie = createDummyCookie()
    const session = new Session(
      'foo',
      { hello: 'world' },
      store,
      generateFn,
      cookie,
    )
    expect(session.id).toBe('foo')
  })

  it('save should call set with the cookie and data', () => {
    const store = createDummyStore()
    const cookie = createDummyCookie()
    const session = new Session(
      'foo',
      { hello: 'world' },
      store,
      generateFn,
      cookie,
    )

    const spy = vi.spyOn(store, 'set')

    session.save()
    expect(spy).toHaveBeenCalledWith('foo', { cookie, hello: 'world' })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('destroy should call delete and delete the cookie', () => {
    const store = createDummyStore()
    const cookie = createDummyCookie()
    const session = new Session(
      'foo',
      { hello: 'world' },
      store,
      generateFn,
      cookie,
    )

    const spy = vi.spyOn(store, 'destroy')

    session.destroy()
    expect(cookie.maxAge).toBe(0)
    expect(spy).toHaveBeenCalledWith('foo')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  describe('reload', () => {
    it('should get the data from the store', async () => {
      const store = createDummyStore()
      const cookie = createDummyCookie()
      const session = new Session(
        'foo',
        { hello: 'world' },
        store,
        generateFn,
        cookie,
      )

      const spy = vi.spyOn(store, 'get')

      await session.reload()
      expect(spy).toHaveBeenCalledWith('foo')
      expect(session.data).toEqual({ reloaded: 'data' })
    })

    it('should generate data if none is loaded', async () => {
      const store = createDummyStore()
      const cookie = createDummyCookie()
      const genSpy = vi.fn(generateFn)

      const session = new Session(
        'foo',
        { hello: 'world' },
        store,
        genSpy,
        cookie,
      )

      const spy = vi.spyOn(store, 'get')
      spy.mockImplementation(() => Promise.resolve(undefined))

      await session.reload()
      expect(spy).toHaveBeenCalledWith('foo')
      expect(genSpy).toHaveBeenCalled()
      expect(session.data).toEqual({ msg: 'hello' })
    })
  })

  describe('regenerate', () => {
    it('should update the cookie id', async () => {
      const store = createDummyStore()
      const cookie = createDummyCookie()
      const session = new Session(
        'foo',
        { hello: 'world' },
        store,
        generateFn,
        cookie,
      )

      const spy = vi.spyOn(cookie, 'setSessionId')

      await session.regenerate()

      expect(spy).toHaveBeenCalledWith('bar')
    })

    it('should destroy the old data and set the new data', async () => {
      const store = createDummyStore()
      const cookie = createDummyCookie()
      const session = new Session(
        'foo',
        { hello: 'world' },
        store,
        generateFn,
        cookie,
      )

      const destroySpy = vi.spyOn(store, 'destroy')
      const setSpy = vi.spyOn(store, 'set')

      await session.regenerate()

      expect(cookie.maxAge).toBe(DEFAULT_MAX_AGE)
      expect(destroySpy).toHaveBeenCalledWith('foo')
      expect(setSpy).toHaveBeenCalledWith('bar', { cookie, msg: 'hello' })
    })
  })
})
