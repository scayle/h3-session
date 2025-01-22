// A session implementation for h3 based on express-session
import { Buffer } from 'node:buffer'
import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { defu } from 'defu'
import { randomUUID, subtle } from 'uncrypto'
import { getCryptoSignKey, getCryptoVerifyKey } from './crypto'
import { Session } from './session'

export type SessionCookieOptions = Parameters<typeof setCookie>[3]

export type SessionCookie = SessionCookieOptions & {
  setSessionId: (sid: string) => Promise<void>
}

export interface SessionDataT {}

// The session as saved in the store, without any methods added
export type RawSession = SessionDataT

export interface SessionStore {
  all?: () => Promise<RawSession[]>
  destroy: (sid: string) => Promise<void>
  clear?: () => Promise<void>
  length?: () => Promise<number>
  get: (sid: string) => Promise<RawSession | undefined>
  set: (sid: string, data: RawSession) => Promise<void>
  touch: (sid: string, data: SessionDataT) => Promise<void>
}

export interface H3SessionOptions {
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

declare module 'h3' {
  export interface H3EventContext {
    session: Session
    sessionId: string
    sessionStore: SessionStore
  }
}

const signatureLength = 43
function parseCookieValue(value: string): [string, string] | undefined {
  if (value.length < signatureLength + 3) {
    return undefined
  }

  const separatorIndex = value.length - signatureLength - 1
  // Ensure prefix and separator are present
  if (
    value.charAt(0) !== 's' ||
    value.charAt(1) !== ':' ||
    value.charAt(separatorIndex) !== '.'
  ) {
    return undefined
  }

  return [
    value.substring(2, separatorIndex),
    value.substring(separatorIndex + 1),
  ]
}

/**
 * Verify that a cookie was signed with one of the secrets
 * If it's valid, return the embedded message
 *
 * @param value a cookie value in the format `s:[value].[signature]`
 * @param secrets an array of secret strings to verify with
 */
export async function unsignCookie(
  value: string,
  secrets: string[],
): Promise<string | false> {
  // Validate cookie format
  const matches = parseCookieValue(value)
  if (!matches) {
    return false
  }

  const [message, signature] = matches

  const encoder = new TextEncoder()
  const messageUint8Array = encoder.encode(message)

  const signatureUint8Array = Uint8Array.from(Buffer.from(signature, 'base64'))

  for (let i = 0; i < secrets.length; i++) {
    const cryptoKey = await getCryptoVerifyKey(secrets[i])

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
export async function signCookie(
  value: string,
  secret: string,
): Promise<string> {
  if (!value) {
    throw new Error('[h3-session] No value was provided!')
  }

  if (!secret) {
    throw new Error('[h3-session] No secret was provided!')
  }

  // Convert the value and secret to Uint8Array
  const encoder = new TextEncoder()
  const messageUint8Array = encoder.encode(value)
  const cryptoKey = await getCryptoSignKey(secret)

  const signature = await subtle.sign('HMAC', cryptoKey, messageUint8Array)

  // Encode in base64
  const b64Signature = Buffer.from(signature)
    .toString('base64')
    .replace(/=+$/, '')

  return `s:${value}.${b64Signature}`
}

export function validateConfig(config: H3SessionOptions) {
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
export async function useSession(event: H3Event, config: H3SessionOptions) {
  // Skip if session is already attached
  if (event.context.session) {
    return
  }

  validateConfig(config)

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

  // Secret can be a string or array, normalize to an array
  const normalizedSecrets = Array.isArray(sessionConfig.secret)
    ? sessionConfig.secret
    : [sessionConfig.secret]

  const createSessionCookie = async (sid: string): Promise<SessionCookie> => {
    let signedCookie: string

    const cookie = {
      ...sessionConfig.cookie,
      // Default to a max age of one day
      maxAge: sessionConfig.cookie.maxAge || 60 * 60 * 24,
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
        // @ts-expect-error Implicitly has type any
        target[property] = value
        setCookie(event, sessionConfig.name, signedCookie, cookie)
        return true
      },
    })
  }

  // Check the request for a session cookie
  const rawCookie = getCookie(event, sessionConfig.name)

  // Extract the ID from the cookie
  const sessionId = rawCookie
    ? await unsignCookie(rawCookie, normalizedSecrets)
    : null

  // Load the session data from the store
  let sessionData: RawSession | undefined

  if (sessionId) {
    sessionData = await store.get(sessionId)
  }

  async function createNewSession() {
    const { id, data } = await generate()
    const cookie = await createSessionCookie(id)

    event.context.session = new Session(id, data, store, generate, cookie)

    if (sessionConfig.saveUninitialized) {
      await event.context.session.save()
    }

    // Set sessionId on event context
    event.context.sessionId = id
  }

  async function createExistingSession(id: string, data?: RawSession) {
    const cookie = await createSessionCookie(id)

    if (store.touch && data) {
      // touch existing sessions to refresh their TTLs
      await store.touch(id, data)
    }

    event.context.session = new Session(
      id,
      data ?? sessionConfig.generate(),
      store,
      generate,
      cookie,
    )
    // Set sessionId on event context
    event.context.sessionId = id
  }

  // Create the session data and a new ID if it does not exist
  if (!sessionId) {
    await createNewSession()
  } else if (!sessionData) {
    await createExistingSession(sessionId)
  } else {
    await createExistingSession(sessionId, sessionData)
  }

  // expose session store
  event.context.sessionStore = store
}

export * from './session'
export * from './unstorage-store'
