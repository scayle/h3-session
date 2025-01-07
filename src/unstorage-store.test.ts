import { describe, expect, it, vi } from 'vitest'
import { createStorage } from 'unstorage'
import MemoryDriver from 'unstorage/drivers/memory'
import { UnstorageSessionStore } from './unstorage-store'

describe('unstorage-store', () => {
  it('should set the item in the unstorage store', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const store = new UnstorageSessionStore(storage)
    await store.set('123', { foo: 'bar' })
    expect(await storage.getItem('sess:123')).toEqual({ foo: 'bar' })
  })

  it('should use the custom prefix if provided', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const store = new UnstorageSessionStore(storage, { prefix: 'custom' })
    await store.set('123', { foo: 'bar' })
    expect(await storage.getItem('custom:123')).toEqual({ foo: 'bar' })
  })

  it('should pass the configured TTL to setItem', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const spy = vi.spyOn(storage, 'setItem')
    const store = new UnstorageSessionStore(storage, { ttl: 12345 })
    await store.set('123', { foo: 'bar' })
    expect(spy).toHaveBeenCalledWith('sess:123', { foo: 'bar' }, { ttl: 12345 })
  })

  it('should allow for a custom ttl function', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const spy = vi.spyOn(storage, 'setItem')
    const store = new UnstorageSessionStore(storage, { ttl: () => 999 })
    await store.set('123', { foo: 'bar' })
    expect(spy).toHaveBeenCalledWith('sess:123', { foo: 'bar' }, { ttl: 999 })
  })

  it('should remove the item if the ttl is zero', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const spy = vi.spyOn(storage, 'removeItem')
    const store = new UnstorageSessionStore(storage, { ttl: () => 0 })
    await store.set('123', { foo: 'bar' })
    expect(spy).toHaveBeenCalledWith('sess:123')
  })

  it('destroy()', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const store = new UnstorageSessionStore(storage, { prefix: 'custom' })
    await store.set('123', { foo: 'bar' })
    expect((await storage.keys()).length).toBe(1)
    await store.destroy('12345')
    expect((await storage.keys()).length).toBe(1)
    await store.destroy('123')
    expect((await storage.keys()).length).toBe(0)
  })

  it('clear()', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const store = new UnstorageSessionStore(storage, { prefix: 'custom' })
    await store.set('123', { foo: 'bar' })
    expect((await storage.keys()).length).toBe(1)
    await store.clear()
    expect((await storage.keys()).length).toBe(0)
  })

  it('length()', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const store = new UnstorageSessionStore(storage, { prefix: 'custom' })
    expect(await store.length()).toBe(0)
    await store.set('123', { foo: 'bar' })
    await store.set('456', { foo: 'bar' })
    expect(await store.length()).toBe(2)
    await store.set('789', { foo: 'bar' })
    expect(await store.length()).toBe(3)
  })

  it('all()', async () => {
    const storage = createStorage({ driver: MemoryDriver() })
    const store = new UnstorageSessionStore(storage, { prefix: 'custom' })
    expect(await store.length()).toBe(0)
    await store.set('123', { foo: 'bar' })
    await store.set('456', { foo: 'bar' })
    expect(await store.length()).toBe(2)
    await store.set('789', { foo: 'bar' })
    expect(await store.length()).toBe(3)
    expect(await store.all()).toEqual([{ foo: 'bar' }, { foo: 'bar' }, {
      foo: 'bar',
    }])
  })
})
