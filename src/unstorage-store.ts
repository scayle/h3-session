import type { Storage } from 'unstorage'
import { z } from 'zod'
import type { RawSession, SessionStore } from './index'

type TTL = number | ((data: RawSession) => number)

interface UnstorageSessionStoreOptions {
  prefix: string
  ttl: TTL
}

const CookieSchema = z.object({
  domain: z.string().optional(),
  expires: z.coerce.date().optional(),
  httpOnly: z.boolean().optional(),
  maxAge: z.number().optional(),
  path: z.string().optional(),
  sameSite: z.enum(['lax', 'none', 'strict']).or(z.boolean()).optional(),
  secure: z.boolean().optional(),
})

export class UnstorageSessionStore implements SessionStore {
  storage: Storage<RawSession>
  prefix: string
  ttl: TTL

  constructor(
    storage: Storage,
    options?: Partial<UnstorageSessionStoreOptions>,
  ) {
    this.storage = storage
    this.prefix = options?.prefix ?? 'sess'
    this.ttl = options?.ttl ?? 60 * 60 * 24
  }

  /**
   * Destroy the session with the specified session ID
   * @param sid the un-prefixed session ID
   */
  async destroy(sid: string): Promise<void> {
    await this.storage.removeItem(this.getKey(sid))
  }

  /**
   * Get the session with the specified session ID
   * @param sid the un-prefixed session ID
   */
  async get(sid: string) {
    const item = await this.storage.getItem(this.getKey(sid))

    // If the cookie saved in the storage is not valid, delete it
    if (item && item.cookie) {
      try {
        item.cookie = CookieSchema.parse(item.cookie)
      } catch {
        delete item.cookie
      }
    }

    return item ?? undefined
  }

  /**
   * Save the session with the specified session ID
   * If the session has expired (has a TTL <= 0) it is deleted.
   * @param sid the un-prefixed session ID
   * @param data the session data
   */
  async set(sid: string, data: RawSession) {
    const ttl = this.getTTL(data)

    if (ttl > 0) {
      await this.storage.setItem(this.getKey(sid), data, { ttl })
    } else {
      await this.destroy(sid)
    }
  }

  /**
   * Update a session's TTL
   * @param sid the un-prefixed session ID
   * @param data the session data
   */
  async touch(sid: string, data: RawSession) {
    // For now, it seems the best way to bump the TTL through the unstorage
    // interface is by re-saving the data
    await this.set(sid, data)
  }

  /**
   * Remove all saved sessions
   */
  async clear() {
    return await this.storage.clear(this.prefix)
  }

  /**
   * Fetch all saved sessions.
   */
  async all() {
    const keys = await this.getAllKeys()
    const values = await this.storage.getItems(keys)

    return values.map(({ value }) => {
      return value as RawSession
    })
  }

  /**
   * Returns the number of saved sessions
   */
  async length() {
    const keys = await this.getAllKeys()
    return keys.length
  }

  private async getAllKeys(): Promise<string[]> {
    return await this.storage.getKeys(this.prefix)
  }

  private getKey(key: string) {
    return [this.prefix, key].join(':')
  }

  /**
   * Get the TTL for the session, either from the TTL function if it exists
   * or falling back to the default TTL value.
   * @param session
   * @private
   */
  private getTTL(session: RawSession) {
    if (typeof this.ttl === 'function') {
      return this.ttl(session)
    }

    return this.ttl
  }
}
