import type { SessionCookie, SessionDataT, SessionStore } from './index'

export interface SessionMethods {
  save: () => Promise<void>
  reload: () => Promise<void>
  destroy: () => Promise<void>
  regenerate: () => Promise<void>
}

export class Session implements SessionMethods {
  #id: string
  #store: SessionStore
  data: SessionDataT
  #generate: () => Promise<{ id: string; data: SessionDataT }>
  cookie: SessionCookie

  constructor(
    id: string,
    data: SessionDataT,
    store: SessionStore,
    generate: () => Promise<{ id: string; data: SessionDataT }>,
    cookie: SessionCookie,
  ) {
    this.data = data
    this.#id = id
    this.#store = store
    this.#generate = generate
    this.cookie = cookie
  }

  get id(): string {
    return this.#id
  }

  async save(): Promise<void> {
    await this.#store.set(this.#id, this.data)
  }

  async reload(): Promise<void> {
    this.data = (await this.#store.get(this.#id)) ??
      (await this.#generate()).data
  }

  async destroy(): Promise<void> {
    // Delete the cookie by setting maxAge to 0
    this.cookie.maxAge = 0

    await this.#store.destroy(this.#id)
  }

  async regenerate(): Promise<void> {
    await this.#store.destroy(this.#id)
    const { data, id } = await this.#generate()

    this.data = data
    this.#id = id

    await Promise.all([this.cookie.setSessionId(id), this.save()])
  }
}
