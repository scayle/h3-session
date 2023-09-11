// A session implementation for h3 based on express-session
import { H3Event, getCookie, setCookie } from 'h3'
import { defu } from 'defu'
import { subtle, randomUUID } from 'uncrypto'
import { Session } from './session'

export type SessionCookieOptions = Parameters<typeof setCookie>[3]

export type SessionCookie = SessionCookieOptions & {
  setSessionId(sid: string): Promise<void>
}

// The session as saved in the store, without any methods added
export type RawSession<SessionDataT> = SessionDataT & {
  cookie?: SessionCookieOptions
}

export interface SessionStore<SessionDataT> {
  all?: () => Promise<RawSession<SessionDataT>[]>
  destroy: (sid: string) => Promise<void>
  clear?: () => Promise<void>
  length?: () => Promise<number>
  get: (sid: string) => Promise<RawSession<SessionDataT> | undefined>
  set: (sid: string, data: RawSession<SessionDataT>) => Promise<void>
  touch: (sid: string, data: SessionDataT) => Promise<void>
}

interface H3SessionOptions<SessionDataT> {
  // Where session data will be stored
  store: SessionStore<SessionDataT>

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

/**
 * Verify that a cookie was signed with one of the secrets
 * If it's valid, return the embedded message
 *
 * @param value a cookie value in the format `s:[value].[signature]`
 * @param secrets an array of secret strings to verify with
 */
async function unsignCookie(
  value: string,
  secrets: string[],
): Promise<string | false> {
  // Validate cookie format
  const matches = /s:([^.]*)\.(.*)/.exec(value)
  if (!matches) {
    return false
  }

  const [, message, signature] = matches

  const encoder = new TextEncoder()

  const messageUint8Array = encoder.encode(message)

  const signatureUint8Array = Uint8Array.from(Buffer.from(signature, 'base64'))

  for (let i = 0; i < secrets.length; i++) {
    const keyUint8Array = encoder.encode(secrets[i])
    const cryptoKey = await subtle.importKey(
      'raw',
      keyUint8Array,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )

    const result = await subtle.verify(
      'HMAC',
      cryptoKey,
      signatureUint8Array,
      messageUint8Array,
    )

    if (result) {
      return message
    }
  }

  return false
}

/**
 * Creates a signed cookie value in the format `s:[value].[signature]`
 * @param value
 * @param secret
 */
async function signCookie(value: string, secret: string): Promise<string> {
  // Convert the value and secret to Uint8Array
  const encoder = new TextEncoder()
  const messageUint8Array = encoder.encode(value)
  const keyUint8Array = encoder.encode(secret)

  // Import the secret as a CryptoKey
  const cryptoKey = await subtle.importKey(
    'raw',
    keyUint8Array,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await subtle.sign('HMAC', cryptoKey, messageUint8Array)

  // Encode in base64
  const b64Signature = Buffer.from(signature)
    .toString('base64')
    .replace(/=+$/, '')

  return `s:${value}.${b64Signature}`
}

function validateConfig<SessionDataT>(config: H3SessionOptions<SessionDataT>) {
  if (!config.store) {
    throw new Error('[h3-session] Session store is required!')
  }

  if (!config.secret) {
    throw new Error('[h3-session] Session secret is required!')
  }
}

/**
 * Attach a session to an H3Event
 * @param event
 * @param config
 */
export async function useSession<SessionDataT extends object = any>(
  event: H3Event,
  config: H3SessionOptions<SessionDataT>,
) {
  // Skip if session is already attached
  if (event.context.session) {
    return
  }

  validateConfig<SessionDataT>(config)

  // Populate default config values
  const sessionConfig = defu(config, {
    name: 'connect.sid',
    genid: (_event: H3Event) => {
      return randomUUID()
    },
    generate: () => ({}) as SessionDataT,
    cookie: { path: '/', httpOnly: true, secure: true, maxAge: null },
    saveUninitialized: false,
  })

  const { store } = sessionConfig

  const generate = async () => {
    return await Promise.resolve({
      id: sessionConfig.genid(event),
      data: sessionConfig.generate(),
    })
  }

  const createSessionCookie = async (
    sid: string,
    data: SessionDataT | RawSession<SessionDataT>,
  ): Promise<SessionCookie> => {
    let signedCookie: string

    const cookie = {
      ...sessionConfig.cookie,
      // Default to a max age of one day
      maxAge: sessionConfig.cookie.maxAge || 60 * 60 * 24,
      // Copy cookie properties from the saved session
      ...('cookie' in data ? data.cookie : {}),
      setSessionId: async (sid: string) => {
        signedCookie = await signCookie(
          sid,
          normalizedSecrets[normalizedSecrets.length - 1],
        )
        setCookie(event, sessionConfig.name, signedCookie, cookie)
      },
    }

    await cookie.setSessionId(sid)

    // Update the Set-Cookie header whenever a property on the cookie object changes
    // We can't hook into the onBeforeResponse, so this is the best alternative
    return new Proxy(cookie, {
      set(target, property, value) {
        // @ts-ignore
        target[property] = value
        setCookie(event, sessionConfig.name, signedCookie, cookie)
        return true
      },
    })
  }

  // Secret can be a string or array, normalize to an array
  const normalizedSecrets = Array.isArray(sessionConfig.secret)
    ? sessionConfig.secret
    : [sessionConfig.secret]

  // Check the request for a session cookie
  const rawCookie = getCookie(event, sessionConfig.name)

  // Extract the ID from the cookie
  const sessionId = rawCookie
    ? await unsignCookie(rawCookie, normalizedSecrets)
    : null

  // Load the session data from the store
  let sessionData: RawSession<SessionDataT> | undefined

  if (sessionId) {
    sessionData = await store.get(sessionId)
  }

  async function createNewSession() {
    const { id, data } = await generate()
    const cookie = await createSessionCookie(id, data)

    event.context.session = new Session<SessionDataT>(
      id,
      data,
      store,
      generate,
      cookie,
    )

    if (sessionConfig.saveUninitialized) {
      await event.context.session.save()
    }

    // Set sessionId on event context
    event.context.sessionId = id
  }

  async function createExistingSession(
    id: string,
    data: RawSession<SessionDataT>,
  ) {
    const cookie = await createSessionCookie(id, data)

    if (store.touch) {
      // touch existing sessions to refresh their TTLs
      await store.touch(id, data)
    }

    event.context.session = new Session<SessionDataT>(
      id,
      data,
      store,
      generate,
      cookie,
    )
    // Set sessionId on event context
    event.context.sessionId = id
  }

  // Create the session data and a new ID if it does not exist
  if (!sessionId || !sessionData) {
    await createNewSession()
  } else {
    await createExistingSession(sessionId, sessionData)
  }

  // expose session store
  event.context.sessionStore = store
}

export * from './session'
export * from './unstorage-store'
