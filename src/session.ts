import type { SessionStore, SessionCookie } from './index'

export interface SessionMethods {
  save: () => Promise<void>
  reload: () => Promise<void>
  destroy: () => Promise<void>
  regenerate: () => Promise<void>
}

export type SessionT<SessionDataT> = SessionDataT & SessionMethods

export class Session<SessionDataT> implements SessionMethods {
  #id: string
  #store: SessionStore<SessionDataT>
  data: SessionDataT
  #generate: () => Promise<{ id: string; data: SessionDataT }>
  cookie: SessionCookie

  constructor(
    id: string,
    data: SessionDataT,
    store: SessionStore<SessionDataT>,
    generate: () => Promise<{ id: string; data: SessionDataT }>,
    cookie: SessionCookie,
  ) {
    this.data = data
    this.#id = id
    this.#store = store
    this.#generate = generate
    this.cookie = cookie
  }

  get id() {
    return this.#id
  }

  async save() {
    await this.#store.set(this.#id, { ...this.data, cookie: this.cookie })
  }

  async reload() {
    this.data =
      (await this.#store.get(this.#id)) ?? (await this.#generate()).data
  }

  async destroy() {
    // Delete the cookie by setting maxAge to 0
    this.cookie.maxAge = 0

    await this.#store.destroy(this.#id)
  }

  async regenerate() {
    await this.#store.destroy(this.#id)
    const { data, id } = await this.#generate()

    this.data = data
    this.#id = id

    await Promise.all([this.cookie.setSessionId(id), this.save()])
  }
}
