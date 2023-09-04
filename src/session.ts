import type { SessionStore, SessionCookie } from './index'

export interface SessionMethods {
  save: () => Promise<void>
  reload: () => Promise<void>
  destroy: () => Promise<void>
  regenerate: () => Promise<void>
}

export type SessionT<SessionDataT> = SessionDataT & SessionMethods

export class Session<SessionDataT> implements SessionMethods {
  _id: string
  _store: SessionStore<SessionDataT>
  _data: SessionDataT
  _generate: () => Promise<{ id: string; data: SessionDataT }>
  cookie: SessionCookie

  constructor(
    id: string,
    data: SessionDataT,
    store: SessionStore<SessionDataT>,
    generate: () => Promise<{ id: string; data: SessionDataT }>,
    cookie: SessionCookie,
  ) {
    this._data = data
    this._id = id
    this._store = store
    this._generate = generate
    this.cookie = cookie
  }

  get id() {
    return this._id
  }

  async save() {
    await this._store.set(this._id, { ...this._data, cookie: this.cookie })
  }

  async reload() {
    this._data =
      (await this._store.get(this._id)) ?? (await this._generate()).data
  }

  async destroy() {
    // Delete the cookie by setting maxAge to 0
    this.cookie.maxAge = 0

    await this._store.destroy(this._id)
  }

  async regenerate() {
    await this._store.destroy(this._id)
    const { data, id } = await this._generate()

    this._data = data
    this._id = id

    await Promise.all([this.cookie.setSessionId(id), this.save()])
  }
}
