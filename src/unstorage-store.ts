import type { Storage } from 'unstorage'
import type { SessionStore, RawSession } from './index'

type TTL<SessionDataT> = number | ((data: RawSession<SessionDataT>) => number)

interface UnstorageSessionStoreOptions<SessionDataT> {
  prefix: string
  ttl: TTL<SessionDataT>
}

export class UnstorageSessionStore<SessionDataT extends object>
  implements SessionStore<SessionDataT>
{
  storage: Storage<RawSession<SessionDataT>>
  prefix: string
  ttl: TTL<SessionDataT>

  constructor(
    storage: Storage<SessionDataT>,
    options?: Partial<UnstorageSessionStoreOptions<SessionDataT>>,
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
    return (await this.storage.getItem(this.getKey(sid))) ?? undefined
  }

  /**
   * Save the session with the specified session ID
   * If the session has expired (has a TTL <= 0) it is deleted.
   * @param sid the un-prefixed session ID
   * @param data the session data
   */
  async set(sid: string, data: RawSession<SessionDataT>) {
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
  async touch(sid: string, data: RawSession<SessionDataT>) {
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
   *
   * Note: This should be used carefully with large redis databases.
   * Both Redis 6 and ElastiCache have limit of 1M items on bulk commands.
   * For bulk operations then, it is better to use the redis client directly,
   * and split the operation into chunks.
   */
  async all() {
    const keys = await this.getAllKeys()
    const values = await this.storage.getItems(keys)

    return values.map(({ value }) => {
      return value as RawSession<SessionDataT>
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
  private getTTL(session: RawSession<SessionDataT>) {
    if (typeof this.ttl === 'function') {
      return this.ttl(session)
    }

    return this.ttl
  }
}
