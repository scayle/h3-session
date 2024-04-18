# @scayle/h3-session

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![License][license-src]][license-href]

Persistent sessions for [h3](https://github.com/unjs/h3). Based on [express-session](https://www.npmjs.com/package/express-session).

## Installation

```bash
# Using pnpm
pnpm add @scayle/h3-session

# Using yarn
yarn add @scayle/h3-session

# Using npm
npm install @scayle/h3-session
```

## Usage

```ts
import { UnstorageSessionStore, useSession } from '@scayle/h3-session'
import { createStorage } from 'unstorage'

const DEFAULT_TTL = 60 * 60 * 24

const redisStore = UnstorageSessionStore(
  createStorage({
    driver: redisDriver({
      host: 'localhost',
      port: 6379,
    }),
  }),
  {
    ttl: DEFAULT_TTL,
  },
)

export default defineEventHandler(async (event) => {
  await useSession(event, {
    store: redisStore,
    secret: 'my-secret',
  })

  const sessionId = event.context.sessionId
  const sessionData = event.context.session.data
})
```

## useSession options

The following options can be passed as the second argument to `useSession`. `store` and `secret` must be defined.

```ts
interface H3SessionOptions {
  // Where session data will be stored
  store: SessionStore

  // Settings for configuring the session cookie
  // Cookies are serialized with [`cookie-es`](https://github.com/unjs/cookie-es).
  // The default value is { path: '/', httpOnly: true, secure: true, maxAge: null }.
  cookie?: {
    domain?: string
    expires?: Date
    httpOnly?: boolean
    maxAge?: number
    path?: string
    sameSite?: true | false | 'lax' | 'none' | 'strict'
    secure?: boolean
  }

  // The name of the session cookie. Defaults to 'connect.sid'
  name?: string

  // Function to generate a session ID. Defaults to randomUUID
  genid?: (event: H3Event) => string

  // Function to generate new session data
  generate?: () => SessionDataT

  // Should the session be automatically saved on initialization?
  saveUninitialized?: boolean

  // Secret(s) to use for cookie signing
  secret: string | string[]
}
```

## Session object

`useSession` attaches a `Session` object to `event.context.session`. The `Session` object has several methods along with an `id` property containing the session's ID, a `data` property which contains the session's data and a `cookie` property representing the session's cookie.

### Session.save()

Save the session to the store. Unlike `express-session`, session data is not saved automatically when it is changed, so this function should be called after modifying the session or at the end of the request.

### Session.reload()

Reload the session's data from the store.

### Session.destroy()

Destroy the session by removing its data from the store and deleting the cookie.

### Session.regenerate()

Recreate the session with a new ID and empty data.

## SessionCookie

The `cookie` property on the session can be used to control the session's cookie. Any of the cookie serialization options such as `maxAge` or `domain` can be edited and will affect the `Set-Cookie` header sent in the response. Additionally, `setSessionId(sid: string)` can be called to update the cookie's value with a new session ID.

## SessionStore

Any object implementing the `SessionStore` interface can be used as the `store` option.

There is an included `UnstorageSessionStore` class to create `SessionStore` backed by an [`unstorage`](https://unstorage.unjs.io/) provider. To avoid accumulating dead sessions, use a driver (such as redis) which supports the `ttl` option.

A reference to the store is added to `event.context.sessionStore` to enable manual management of the session data. (e.g. clearing all saved sessions)

## Cookie signing

The value of the session cookie is a signed variant of the session's ID. The format is `s:[sessionID].[signature]`. e.g. `s:7247d6e9-8ddb-4005-988b-9aa82bd7d6d5.lERU16bdv6tojUNeM8V2UOARyNxHNaWKIYi4bLRxx7o`. This matches the format used by `express-session`, so existing sessions can be preserved when migrating.

The secret used for signing cookies is set in the options of `useSession`. It can be a `string` or `string[]`. When specified as an array, the last item will be used for signing new session cookies, but all secrets will be used to verify existing cookies. This allows changing the signing secret without invalidating existing sessions.

## Typing

The type of the session data can be specified by augmenting the `SessionDataT` interface.

```ts
declare module '@scayle/h3-session' {
  export interface SessionDataT {
    userId: string
    token: string
  }
}
```

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/@scayle/h3-session/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/@scayle/h3-session
[npm-downloads-src]: https://img.shields.io/npm/dm/@scayle/h3-session.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npmjs.com/package/@scayle/h3-session
[license-src]: https://img.shields.io/npm/l/@scayle/h3-session.svg?style=flat&colorA=18181B&colorB=28CF8D
[license-href]: https://npmjs.com/package/@scayle/h3-session
